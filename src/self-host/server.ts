import { createServer, type IncomingMessage } from "node:http";
import { Pool } from "pg";
import {
  D1Project42Repository,
  handleRequest,
} from "../worker.js";
import {
  createSelfHostAuthAbuseLimiter,
  createTrustedSocketClientAddressResolver,
} from "./auth-abuse.js";
import { readConfiguration } from "./config.js";
import { FilesystemProfilePhotoBucket } from "./filesystem-profile-photo-bucket.js";
import { writeWebResponseToNode } from "./http-response.js";
import { applyPostgresMigrations } from "./migrate.js";
import { PostgresD1CompatibilityDatabase } from "./postgres-d1.js";

const configuration = readConfiguration(process.env);
const pool = new Pool({
  connectionString: configuration.databaseUrl,
  max: configuration.databasePoolSize,
  ssl: configuration.databaseTls ? { rejectUnauthorized: true } : false,
});
const authAbuseLimiter = createSelfHostAuthAbuseLimiter(pool);
await applyPostgresMigrations(pool, configuration.migrationDirectory);
const database = new PostgresD1CompatibilityDatabase(pool);
const repository = new D1Project42Repository(
  database as unknown as D1Database,
  configuration.installationId,
  undefined,
  configuration.accountMergeRequiredConsents,
);
const profilePhotos = new FilesystemProfilePhotoBucket(
  configuration.profilePhotoDirectory,
);
await profilePhotos.initialize();
const workerEnvironment = {
  PROJECT42_DB: database as unknown as D1Database,
  INSTALLATION_ID: configuration.installationId,
  OIDC_ISSUER: configuration.oidcIssuer,
  OIDC_AUDIENCE: configuration.oidcAudience,
  OIDC_JWKS_URL: configuration.oidcJwksUrl,
  OIDC_EMAIL_CLAIM: configuration.oidcEmailClaim,
  OIDC_EMAIL_VERIFIED_CLAIM: configuration.oidcEmailVerifiedClaim,
  DOMAIN_APPROVAL_ENABLED: String(configuration.domainApprovalEnabled),
  LEARNING_RECORD_ADAPTER: configuration.learningRecordAdapter.adapter,
  ALLOWED_ORIGINS: configuration.allowedOrigins.join(","),
  BOOTSTRAP_OWNER_ISSUER: configuration.bootstrapOwnerIssuer,
  BOOTSTRAP_OWNER_SUBJECT: configuration.bootstrapOwnerSubject,
  ACCOUNT_MERGE_REQUIRED_CONSENTS: JSON.stringify(
    configuration.accountMergeRequiredConsents,
  ),
  PROFILE_PHOTOS: profilePhotos as unknown as R2Bucket,
  ...(configuration.browserSession.mode === "oidc"
    ? {
        OIDC_AUTHORIZATION_ENDPOINT:
          configuration.browserSession.authorizationEndpoint,
        OIDC_TOKEN_ENDPOINT: configuration.browserSession.tokenEndpoint,
        OIDC_CLIENT_ID: configuration.browserSession.clientId,
        ...(configuration.browserSession.clientSecret
          ? { OIDC_CLIENT_SECRET: configuration.browserSession.clientSecret }
          : {}),
        OIDC_REDIRECT_URI: configuration.browserSession.redirectUri,
        ...(configuration.browserSession.logoutEndpoint
          ? { OIDC_LOGOUT_ENDPOINT: configuration.browserSession.logoutEndpoint }
          : {}),
        SESSION_ENCRYPTION_KEY: configuration.browserSession.encryptionKey,
      }
    : {}),
} as unknown as Env;

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming, configuration.publicUrl);
    const response = await handleRequest(
      request,
      workerEnvironment,
      undefined,
      repository,
      undefined,
      configuration.learningRecordAdapter,
      undefined,
      authAbuseLimiter,
      createTrustedSocketClientAddressResolver(incoming),
    );
    await writeWebResponseToNode(outgoing, response);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        code: "self_host_request_failure",
        message: error instanceof Error ? error.message : "Unknown request failure",
      }),
    );
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "application/json");
    outgoing.end(JSON.stringify({ error: { code: "internal_error" } }));
  }
});

server.listen(configuration.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "self_host_api_started",
      port: configuration.port,
      installationId: configuration.installationId,
    }),
  );
});

async function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  server.close();
  await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

async function toWebRequest(request: IncomingMessage, publicUrl: URL) {
  const method = request.method ?? "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const chunks: Uint8Array[] = [];
  if (method !== "GET" && method !== "HEAD") {
    for await (const chunk of request) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
  return new Request(new URL(request.url ?? "/", publicUrl), {
    method,
    headers,
    ...(body ? { body: new Uint8Array(body) } : {}),
  });
}

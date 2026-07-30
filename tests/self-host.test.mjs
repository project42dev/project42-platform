import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer, get } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Pool } from "pg";
import { Miniflare } from "miniflare";
import {
  DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES,
  runLearningRecordAdapterConformance,
  runMeasuredLearningRecordRecoveryConformance,
  SqlLearningEventStore,
  verifyLearningRecordAdapterParity,
} from "../dist/index.js";
import { AuthAbuseLimiterUnavailableError } from "../dist/auth-abuse-limiter.js";
import {
  createSelfHostAuthAbuseLimiter,
  createTrustedSocketClientAddressResolver,
} from "../dist/self-host/auth-abuse.js";
import { readConfiguration } from "../dist/self-host/config.js";
import {
  loadAccountNotificationAdapter,
} from "../dist/self-host/account-notification-adapter.js";
import { FilesystemProfilePhotoBucket } from "../dist/self-host/filesystem-profile-photo-bucket.js";
import { writeWebResponseToNode } from "../dist/self-host/http-response.js";
import { applyPostgresMigrations } from "../dist/self-host/migrate.js";
import {
  toPostgresParameters,
  toPostgresValue,
} from "../dist/self-host/postgres-d1.js";
import { PostgresD1CompatibilityDatabase } from "../dist/self-host/postgres-d1.js";
import { PostgresAuthAbuseLimiter } from "../dist/self-host/postgres-auth-abuse-limiter.js";
import { D1Project42Repository, handleRequest } from "../dist/worker.js";

const evaluationEnvironment = {
  NODE_ENV: "evaluation",
  PROJECT42_EVALUATION_MODE: "true",
  PUBLIC_URL: "http://localhost:8787",
  INSTALLATION_ID: "test-installation",
  DATABASE_URL: "postgresql://project42:test@database:5432/project42",
  OIDC_ISSUER: "http://localhost:8080/realms/project42",
  OIDC_AUDIENCE: "project42-api",
  OIDC_JWKS_URL:
    "http://identity:8080/realms/project42/protocol/openid-connect/certs",
  ALLOWED_ORIGINS: "http://localhost:3000",
  LEARNING_RECORD_ADAPTER: "postgresql",
};

function composeServiceBlock(compose, name) {
  const normalizedCompose = compose.replace(/\r\n/g, "\n");
  const marker = `  ${name}:\n`;
  const start = normalizedCompose.indexOf(marker);
  assert.notEqual(start, -1, `Compose service ${name} must exist`);
  const remainder = normalizedCompose.slice(start + marker.length);
  const nextService = remainder.search(/^  [a-z0-9][a-z0-9-]*:$/m);
  return nextService === -1 ? remainder : remainder.slice(0, nextService);
}

async function applyD1Migrations(database) {
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
}

async function seedRecoveryPrincipals(database, installationId, learnerIds) {
  await database
    .prepare("INSERT INTO installations VALUES (?, ?, ?, ?)")
    .bind(
      installationId,
      "Recovery conformance",
      "2026-07-28T00:00:00.000Z",
      "2026-07-28T00:00:00.000Z",
    )
    .run();
  for (const learnerId of learnerIds) {
    await database
      .prepare(
        `INSERT INTO users (
           id, installation_id, display_name, primary_email,
           email_verified, account_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        learnerId,
        installationId,
        "Synthetic recovery learner",
        null,
        0,
        "approved",
        "2026-07-28T00:00:00.000Z",
        "2026-07-28T00:00:00.000Z",
      )
      .run();
  }
}

test("reference Compose gates API readiness on the public health contract", async () => {
  const compose = await readFile(
    new URL("../self-host/compose.yaml", import.meta.url),
    "utf8",
  );
  const apiService = composeServiceBlock(compose, "api");

  assert.match(apiService, /\n    healthcheck:\r?\n/);
  assert.match(
    apiService,
    /require\('node:http'\)\.get\('http:\/\/127\.0\.0\.1:8787\/health'/,
  );
  assert.match(apiService, /response\.statusCode === 200/);
  assert.match(apiService, /\n      interval: 10s\r?\n/);
  assert.match(apiService, /\n      timeout: 3s\r?\n/);
  assert.match(apiService, /\n      start_period: 20s\r?\n/);
  assert.match(apiService, /\n      retries: 6\r?\n/);
});

test("secure reference Compose exposes only the HTTPS gateway", async () => {
  const compose = await readFile(
    new URL("../self-host/compose.https.yaml", import.meta.url),
    "utf8",
  );
  const gateway = composeServiceBlock(compose, "gateway");
  const api = composeServiceBlock(compose, "api");
  const identity = composeServiceBlock(compose, "identity");

  assert.match(gateway, /image: caddy:2\.11\.4-alpine/);
  assert.match(gateway, /- "443:443"/);
  assert.doesNotMatch(api, /\n    ports:/);
  assert.doesNotMatch(identity, /\n    ports:/);
  assert.match(api, /NODE_ENV: production/);
  assert.match(api, /BROWSER_SESSION_MODE: oidc/);
  assert.match(
    api,
    /OIDC_REDIRECT_URI: https:\/\/api\.project42\.localhost\/v1\/auth\/callback/,
  );
  assert.match(
    api,
    /NODE_EXTRA_CA_CERTS: \/trust\/root\.crt/,
  );
  assert.match(
    api,
    /OIDC_TOKEN_ENDPOINT: https:\/\/identity\.project42\.internal\//,
  );
  assert.match(
    api,
    /OIDC_JWKS_URL: https:\/\/identity\.project42\.internal\//,
  );
  assert.match(identity, /KC_HOSTNAME: https:\/\/identity\.project42\.localhost/);
  assert.match(identity, /KC_PROXY_HEADERS: xforwarded/);
  assert.match(identity, /KC_HTTP_ENABLED: "true"/);

  const trustExport = composeServiceBlock(compose, "trust-export");
  assert.match(
    trustExport,
    /cp \/caddy-data\/caddy\/pki\/authorities\/local\/root\.crt \/trust\/root\.crt/,
  );
  assert.match(trustExport, /chmod 0444 \/trust\/root\.crt/);
  assert.match(
    api,
    /trust-export:\r?\n        condition: service_completed_successfully/,
  );

  const smoke = composeServiceBlock(compose, "secure-topology-smoke");
  assert.match(smoke, /CURL_CA_BUNDLE: \/trust\/root\.crt/);
  for (const host of [
    "learn.project42.localhost",
    "api.project42.localhost",
    "identity.project42.localhost",
  ]) {
    assert.match(
      smoke,
      new RegExp(`--connect-to ${host.replaceAll(".", "\\.")}:443:gateway:443`),
    );
  }
});

test("secure release gate drives a real browser session and isolated restore", async () => {
  const [
    compose,
    browserSmoke,
    backupSmoke,
    browserDockerfile,
    browserSeccompText,
    workflow,
  ] =
    await Promise.all([
      readFile(
        new URL("../self-host/compose.https.yaml", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../scripts/smoke-secure-browser-session.mjs",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../self-host/smoke-secure-backup-restore.sh",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../self-host/browser-smoke/Dockerfile",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../self-host/browser-smoke/seccomp_profile.json",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
    ]);

  const browserService = composeServiceBlock(
    compose,
    "secure-browser-session-smoke",
  );
  assert.match(browserService, /profiles: \["test"\]/);
  assert.match(browserService, /project42_trust:\/trust:ro/);
  assert.match(browserService, /no-new-privileges:true/);
  assert.match(browserService, /cap_drop:\s*\n\s+- ALL/);
  assert.match(browserService, /cap_add:\s*\n\s+- SYS_CHROOT/);
  assert.doesNotMatch(browserService, /SYS_ADMIN/);
  assert.match(
    browserService,
    /seccomp=\.\/browser-smoke\/seccomp_profile\.json/,
  );
  assert.doesNotMatch(browserService, /\n    ports:/);
  assert.match(browserDockerfile, /playwright:v1\.55\.1-noble/);
  assert.match(
    browserService,
    /\/home\/pwuser:size=64m,mode=0700,uid=1001,gid=1001/,
  );
  assert.match(browserDockerfile, /test "\$\(id -u pwuser\)" = "1001"/);
  assert.match(browserDockerfile, /test "\$\(id -g pwuser\)" = "1001"/);
  assert.match(browserDockerfile, /USER pwuser/);
  assert.match(browserSmoke, /chromium\.launch/);
  assert.match(browserSmoke, /chromiumSandbox: true/);
  assert.match(browserSmoke, /verifyProvisionedUser/);
  assert.doesNotMatch(browserSmoke, /Keycloak did not preserve/);
  assert.doesNotMatch(browserSmoke, /waitUntil: "networkidle"/);
  assert.match(browserSmoke, /__Host-project42_session/);
  assert.match(browserSmoke, /sessionCookie\.secure, true/);
  assert.match(browserSmoke, /sessionCookie\.httpOnly, true/);
  assert.match(browserSmoke, /sessionCookie\.sameSite, "Lax"/);
  assert.doesNotMatch(browserSmoke, /ignoreHTTPSErrors/);
  assert.doesNotMatch(browserSmoke, /--ignore-certificate-errors/);
  assert.doesNotMatch(browserSmoke, /--no-sandbox/);
  const browserSeccomp = JSON.parse(browserSeccompText);
  assert.equal(browserSeccomp.defaultAction, "SCMP_ACT_ERRNO");
  assert.ok(
    browserSeccomp.syscalls.some(
      (rule) =>
        rule.action === "SCMP_ACT_ALLOW" &&
        ["clone", "setns", "unshare"].every((name) =>
          rule.names?.includes(name),
        ),
    ),
  );

  const backupService = composeServiceBlock(
    compose,
    "secure-backup-restore-smoke",
  );
  assert.match(backupService, /project42_profile_photos:\/source-photos:ro/);
  assert.match(backupService, /project42_identity:\/source-identity:ro/);
  assert.match(backupService, /project42_caddy_data:\/source-caddy-data:ro/);
  assert.match(backupService, /project42_caddy_config:\/source-caddy-config:ro/);
  assert.match(backupService, /project42_restore_photos:\/restored-photos/);
  assert.match(
    backupService,
    /project42_restore_identity:\/restored-identity/,
  );
  assert.match(
    backupService,
    /project42_restore_caddy_data:\/restored-caddy-data/,
  );
  assert.match(
    backupService,
    /project42_restore_caddy_config:\/restored-caddy-config/,
  );
  assert.match(backupSmoke, /pg_dump/);
  assert.match(backupSmoke, /pg_restore/);
  assert.match(backupSmoke, /sha256sum -c/);
  assert.match(backupSmoke, /project42_schema_migrations/);
  assert.match(backupSmoke, /directory_manifest/);
  assert.match(backupSmoke, /source-identity/);
  assert.match(backupSmoke, /source-caddy-data/);
  assert.match(backupSmoke, /source-caddy-config/);

  assert.match(workflow, /scan-self-host-release\.mjs/);
  assert.match(workflow, /aquasec\/trivy:0\.66\.0/);
  assert.match(workflow, /fs --scanners secret --exit-code 1/);
  assert.match(workflow, /config --images/);
  assert.match(workflow, /sort --unique/);
  assert.match(workflow, /image --exit-code 1 --severity CRITICAL/);
  assert.doesNotMatch(workflow, /--ignore-unfixed/);
  assert.match(workflow, /secure-browser-session-smoke/);
  assert.match(workflow, /secure-backup-restore-smoke/);
});

test("secure local gateway and realm use exact same-site HTTPS origins", async () => {
  const [caddyfile, realmText] = await Promise.all([
    readFile(new URL("../self-host/Caddyfile", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../self-host/keycloak/project42-https-realm.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  for (const host of [
    "learn.project42.localhost",
    "api.project42.localhost",
    "identity.project42.localhost",
  ]) {
    assert.match(caddyfile, new RegExp(`https://${host.replaceAll(".", "\\.")}`));
  }
  assert.equal((caddyfile.match(/tls internal/g) ?? []).length, 3);
  assert.match(caddyfile, /admin 127\.0\.0\.1:2019/);
  assert.doesNotMatch(caddyfile, /admin 0\.0\.0\.0/);
  assert.match(caddyfile, /https:\/\/identity\.project42\.internal/);

  const realm = JSON.parse(realmText);
  const client = realm.clients.find(
    ({ clientId }) => clientId === "project42-api-browser",
  );
  assert.ok(client);
  assert.equal(client.publicClient, true);
  assert.equal(client.attributes["pkce.code.challenge.method"], "S256");
  assert.deepEqual(client.redirectUris, [
    "https://api.project42.localhost/v1/auth/callback",
  ]);
  assert.deepEqual(client.webOrigins, [
    "https://learn.project42.localhost",
  ]);
});

test("local evaluation profile permits only its explicit HTTP service hosts", () => {
  const configuration = readConfiguration(evaluationEnvironment);
  assert.equal(configuration.publicUrl.href, "http://localhost:8787/");
  assert.equal(configuration.oidcJwksUrl.startsWith("http://identity:"), true);
  assert.deepEqual(configuration.browserSession, { mode: "disabled" });
  assert.deepEqual(configuration.accountMergeRequiredConsents, [
    { purpose: "learning-record", policyVersion: "2026-07-27" },
  ]);
  assert.equal(configuration.accountNotificationAdapterModule, null);

  assert.throws(
    () =>
      readConfiguration({
        ...evaluationEnvironment,
        OIDC_JWKS_URL: "http://untrusted:8080/keys",
      }),
    /must use HTTPS/,
  );
});

test("self-host notification adapters load from an explicit local module", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "project42-notification-adapter-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const adapterPath = join(directory, "adapter.mjs");
  await writeFile(
    adapterPath,
    `export function createAccountNotificationAdapter() {
      return {
        kind: "local-fixture",
        async deliver(message, context) {
          if (context.signal.aborted) throw new Error("aborted");
          return { acceptedAt: context.deadlineAt, id: message.notificationId };
        }
      };
    }`,
    "utf8",
  );
  const adapter = await loadAccountNotificationAdapter(adapterPath);
  assert.equal(adapter.kind, "local-fixture");
  const context = {
    signal: new AbortController().signal,
    deadlineAt: "2026-07-29T12:00:05.000Z",
  };
  assert.deepEqual(
    await adapter.deliver(
      {
        contractVersion: "1.0",
        notificationId: "module-notification",
        kind: "registration-receipt",
        recipient: "learner@example.test",
        subject: "Subject",
        text: "Text",
        html: "<p>Text</p>",
      },
      context,
    ),
    {
      acceptedAt: context.deadlineAt,
      id: "module-notification",
    },
  );
  assert.equal(
    (await loadAccountNotificationAdapter(null)).kind,
    "disabled",
  );
  await assert.rejects(
    loadAccountNotificationAdapter("data:text/javascript,export default {}"),
  );
  assert.throws(
    () =>
      readConfiguration({
        ...evaluationEnvironment,
        ACCOUNT_NOTIFICATION_ADAPTER_MODULE:
          "https://adapter.example.test/module.mjs",
      }),
    /local file or installed package/,
  );
});

test("API-owned self-host browser sessions require a complete HTTPS contract", () => {
  const productionEnvironment = {
    ...evaluationEnvironment,
    NODE_ENV: "production",
    PROJECT42_EVALUATION_MODE: "false",
    PUBLIC_URL: "https://api.example.test",
    OIDC_ISSUER: "https://identity.example.test/realms/project42",
    OIDC_JWKS_URL:
      "https://identity.example.test/realms/project42/protocol/openid-connect/certs",
    ALLOWED_ORIGINS: "https://learn.example.test",
    DATABASE_URL: "postgresql://project42:random-value@database/project42",
    OIDC_AUTHORIZATION_ENDPOINT:
      "https://identity.example.test/realms/project42/protocol/openid-connect/auth",
    OIDC_TOKEN_ENDPOINT:
      "https://identity.example.test/realms/project42/protocol/openid-connect/token",
    OIDC_CLIENT_ID: "project42-api-browser",
    OIDC_REDIRECT_URI: "https://api.example.test/v1/auth/callback",
    OIDC_LOGOUT_ENDPOINT:
      "https://identity.example.test/realms/project42/protocol/openid-connect/logout",
    SESSION_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  };
  const configuration = readConfiguration(productionEnvironment);
  assert.equal(configuration.browserSession.mode, "oidc");
  assert.equal(
    configuration.browserSession.redirectUri,
    "https://api.example.test/v1/auth/callback",
  );

  assert.throws(
    () =>
      readConfiguration({
        ...productionEnvironment,
        OIDC_REDIRECT_URI: "https://learn.example.test/callback",
      }),
    /API public origin followed by/,
  );
  assert.throws(
    () =>
      readConfiguration({
        ...productionEnvironment,
        SESSION_ENCRYPTION_KEY: "too-short",
      }),
    /base64url-encoded 32-byte key/,
  );
  assert.throws(
    () =>
      readConfiguration({
        ...productionEnvironment,
        OIDC_AUTHORIZATION_ENDPOINT:
          "http://identity.example.test/realms/project42/protocol/openid-connect/auth",
      }),
    /must use HTTPS/,
  );
  assert.throws(
    () =>
      readConfiguration({
        ...productionEnvironment,
        BROWSER_SESSION_MODE: "disabled",
      }),
    /permitted only in the local evaluation profile/,
  );
  assert.throws(
    () => {
      const withoutTokenEndpoint = { ...productionEnvironment };
      delete withoutTokenEndpoint.OIDC_TOKEN_ENDPOINT;
      readConfiguration(withoutTokenEndpoint);
    },
    /OIDC_TOKEN_ENDPOINT is required/,
  );
});

test("production self-host configuration fails closed on HTTP and placeholders", () => {
  assert.throws(
    () =>
      readConfiguration({
        ...evaluationEnvironment,
        NODE_ENV: "production",
        PROJECT42_EVALUATION_MODE: "false",
      }),
    /must use HTTPS/,
  );

  assert.throws(
    () =>
      readConfiguration({
        ...evaluationEnvironment,
        NODE_ENV: "production",
        PROJECT42_EVALUATION_MODE: "false",
        PUBLIC_URL: "https://learn.example.org",
        OIDC_ISSUER: "https://identity.example.org/realms/project42",
        OIDC_JWKS_URL: "https://identity.example.org/realms/project42/certs",
        ALLOWED_ORIGINS: "https://learn.example.org",
        DATABASE_URL: "postgresql://project42:change-me@database/project42",
      }),
    /unsafe production placeholder/,
  );
});

test("Node self-host bridge preserves both browser callback Set-Cookie fields", async (t) => {
  const server = createServer(async (_request, response) => {
    const headers = new Headers({ "content-type": "text/plain" });
    headers.append(
      "set-cookie",
      "__Host-project42_session=session; Path=/; Secure; HttpOnly; SameSite=Lax",
    );
    headers.append(
      "set-cookie",
      "__Host-project42_oidc=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
    );
    await writeWebResponseToNode(
      response,
      new Response("ok", { status: 200, headers }),
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await new Promise((resolve, reject) => {
    const request = get(
      `http://127.0.0.1:${address.port}/v1/auth/callback`,
      resolve,
    );
    request.once("error", reject);
  });
  response.resume();
  await new Promise((resolve) => response.once("end", resolve));
  assert.deepEqual(response.headers["set-cookie"], [
    "__Host-project42_session=session; Path=/; Secure; HttpOnly; SameSite=Lax",
    "__Host-project42_oidc=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
  ]);
  assert.equal(
    response.rawHeaders.filter(
      (value) => value.toLowerCase() === "set-cookie",
    ).length,
    2,
  );
});

test("reference Keycloak clients preserve bearer auth_time evidence", async () => {
  const realm = JSON.parse(
    await readFile(
      new URL(
        "../self-host/keycloak/project42-realm.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const learnClient = realm.clients.find(
    (client) => client.clientId === "project42-learn",
  );
  const browserClient = realm.clients.find(
    (client) => client.clientId === "project42-api-browser",
  );
  assert.equal(
    learnClient.attributes["client.use.lightweight.access.token.enabled"],
    "false",
  );
  assert.equal(
    browserClient.attributes["client.use.lightweight.access.token.enabled"],
    "false",
  );
  assert.equal(browserClient.attributes["pkce.code.challenge.method"], "S256");
  assert.deepEqual(browserClient.redirectUris, [
    "https://localhost:8787/v1/auth/callback",
  ]);

  const manifest = JSON.parse(
    await readFile(
      new URL("../self-host/compatibility.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(manifest.identity.requiredClaims.includes("auth_time"));
  assert.ok(manifest.identity.requiredClaims.includes("nonce"));
  assert.equal(manifest.learn.availability, "released");
  assert.equal(manifest.learn.minimumVersion, "0.11.0");
});

test("self-host auth limiter uses PostgreSQL and only the normalized socket peer", async () => {
  const limiter = createSelfHostAuthAbuseLimiter({});
  assert.ok(limiter instanceof PostgresAuthAbuseLimiter);

  const resolveClientAddress = createTrustedSocketClientAddressResolver({
    socket: { remoteAddress: "::ffff:192.0.2.42" },
  });
  const spoofedRequest = new Request(
    "https://api.example.test/v1/auth/start",
    {
      headers: {
        "CF-Connecting-IP": "198.51.100.8",
        "X-Forwarded-For": "203.0.113.7",
      },
    },
  );
  assert.equal(resolveClientAddress(spoofedRequest), "::ffff:192.0.2.42");

  let observedLimitInput;
  const learningRecordConfiguration = readConfiguration(
    evaluationEnvironment,
  ).learningRecordAdapter;
  const response = await handleRequest(
    spoofedRequest,
    {
      INSTALLATION_ID: "self-host-rate-limit-test",
      ALLOWED_ORIGINS: "https://learn.example.test",
      LEARNING_RECORD_ADAPTER: "postgresql",
    },
    {},
    {
      ensureInstallation: async () => undefined,
      createOidcAuthorizationTransaction: async () => undefined,
    },
    undefined,
    learningRecordConfiguration,
    {
      createAuthorization: async () => ({
        location: "https://identity.example.test/authorize",
        cookie:
          "__Host-project42_oidc=opaque; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax",
      }),
    },
    {
      check: async (input) => {
        observedLimitInput = input;
        return { allowed: true, retryAfterSeconds: 60 };
      },
    },
    resolveClientAddress,
  );
  assert.equal(response.status, 302);
  assert.deepEqual(observedLimitInput, {
    installationId: "self-host-rate-limit-test",
    route: "start",
    clientAddress: "::ffff:192.0.2.42",
  });

  const missingPeer = createTrustedSocketClientAddressResolver({
    socket: {},
  });
  assert.throws(
    () => missingPeer(spoofedRequest),
    AuthAbuseLimiterUnavailableError,
  );
});

test("PostgreSQL adapter translates D1 parameters and role aggregation", () => {
  assert.equal(
    toPostgresParameters(
      "SELECT GROUP_CONCAT(r.role) AS roles FROM role_assignments r WHERE a = ? AND b = ?",
    ),
    "SELECT string_agg(r.role, ',') AS roles FROM role_assignments r WHERE a = $1 AND b = $2",
  );
  assert.equal(toPostgresValue(true), 1);
  assert.equal(toPostgresValue(false), 0);
});

test("PostgreSQL batch postconditions run before commit and roll back failure", async () => {
  const queries = [];
  let released = false;
  const client = {
    query: async (sql, values) => {
      queries.push({ sql, values });
      return { rowCount: 1, rows: [] };
    },
    release: () => {
      released = true;
    },
  };
  const database = new PostgresD1CompatibilityDatabase({
    connect: async () => client,
  });
  const statement = database
    .prepare("UPDATE browser_sessions SET revoked_at = ? WHERE id = ?")
    .bind("2026-07-28T00:00:00.000Z", "session-a");

  await assert.rejects(
    () =>
      database.batchWithPostcondition([statement], (results) => {
        assert.equal(results[0].meta.changes, 1);
        throw new Error("postcondition failed");
      }),
    /postcondition failed/,
  );
  assert.deepEqual(
    queries.map(({ sql }) => sql),
    [
      "BEGIN",
      "UPDATE browser_sessions SET revoked_at = $1 WHERE id = $2",
      "ROLLBACK",
    ],
  );
  assert.equal(released, true);
});

test("filesystem profile-photo adapter is private, durable, and traversal-safe", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "project42-profile-photos-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bucket = new FilesystemProfilePhotoBucket(directory);
  await bucket.initialize();
  const key =
    "profiles/0123456789abcdef/00000000-0000-4000-8000-000000000001/" +
    "00000000-0000-4000-8000-000000000002.png";
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
  ]);
  const stored = await bucket.put(key, bytes.buffer);
  assert.match(stored.etag, /^[a-f0-9]{64}$/);
  const object = await bucket.get(key);
  assert.ok(object);
  assert.deepEqual(
    new Uint8Array(await new Response(object.body).arrayBuffer()),
    bytes,
  );
  await bucket.delete(key);
  assert.equal(await bucket.get(key), null);
  await assert.rejects(
    () => bucket.put("../../outside.png", bytes.buffer),
    /supported storage contract/,
  );
});

test(
  "PostgreSQL recovery rehearsal restores exact projections and replays deletion before promotion",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const administrationPool = new Pool({
      connectionString: process.env.TEST_POSTGRES_URL,
    });
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const sourceSchema = `recovery_source_${suffix}`;
    const restoredSchema = `recovery_restored_${suffix}`;
    let sourcePool;
    let restoredPool;
    try {
      await administrationPool.query(`CREATE SCHEMA "${sourceSchema}"`);
      await administrationPool.query(`CREATE SCHEMA "${restoredSchema}"`);
      sourcePool = new Pool({
        connectionString: process.env.TEST_POSTGRES_URL,
        options: `-c search_path=${sourceSchema}`,
      });
      restoredPool = new Pool({
        connectionString: process.env.TEST_POSTGRES_URL,
        options: `-c search_path=${restoredSchema}`,
      });
      await applyPostgresMigrations(sourcePool, "self-host/postgres");
      await applyPostgresMigrations(restoredPool, "self-host/postgres");

      const sourceDatabase = new PostgresD1CompatibilityDatabase(sourcePool);
      const restoredDatabase = new PostgresD1CompatibilityDatabase(
        restoredPool,
      );
      const installationId = "postgres-recovery-conformance";
      const retainedLearnerId = "postgres-recovery-retained";
      const deletedLearnerId = "postgres-recovery-deleted";
      for (const database of [sourceDatabase, restoredDatabase]) {
        await seedRecoveryPrincipals(database, installationId, [
          retainedLearnerId,
          deletedLearnerId,
        ]);
      }

      const sourceCurrentAt = new Date().toISOString();
      const backupCapturedAt = new Date(
        Date.parse(sourceCurrentAt) - 90_000,
      ).toISOString();
      const report = await runMeasuredLearningRecordRecoveryConformance(
        new SqlLearningEventStore(sourceDatabase),
        new SqlLearningEventStore(restoredDatabase),
        {
          installationId,
          retainedLearnerId,
          deletedLearnerId,
          keyPrefix: "postgres-recovery",
          adapter: "postgresql",
          migrationHead: "008_authoritative_progress_imports.sql",
        },
        { backupCapturedAt, sourceCurrentAt },
      );

      assert.equal(report.contractVersion, "1.1");
      assert.equal(report.adapter, "postgresql");
      assert.equal(report.migrationHead, "008_authoritative_progress_imports.sql");
      assert.equal(report.recoveryPointSeconds, 90);
      assert.ok(
        report.recoveryTimeSeconds <=
          DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES.maximumRecoveryTimeSeconds,
      );
      assert.equal(
        report.maximumRecoveryPointSeconds,
        DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES.maximumRecoveryPointSeconds,
      );
      assert.equal(
        report.maximumRecoveryTimeSeconds,
        DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES.maximumRecoveryTimeSeconds,
      );
      assert.equal(report.preBackupProjectionSha256, report.rebuiltProjectionSha256);
      assert.equal(report.deletionReceiptStatus, "verified");
      assert.equal(report.deletionReplayStatus, "verified");
      assert.equal(report.promotionStatus, "ready");

      const sourceReceiptCount = await sourcePool.query(
        "SELECT count(*)::integer AS count FROM learning_record_deletion_receipts",
      );
      const restoredReplayCount = await restoredPool.query(
        "SELECT count(*)::integer AS count FROM learning_record_deletion_replays",
      );
      const deletedEventCount = await restoredPool.query(
        "SELECT count(*)::integer AS count FROM learning_events WHERE installation_id = $1 AND user_id = $2",
        [installationId, deletedLearnerId],
      );
      assert.equal(sourceReceiptCount.rows[0].count, 1);
      assert.equal(restoredReplayCount.rows[0].count, 1);
      assert.equal(deletedEventCount.rows[0].count, 0);
    } finally {
      await sourcePool?.end();
      await restoredPool?.end();
      await administrationPool
        .query(`DROP SCHEMA IF EXISTS "${sourceSchema}" CASCADE`)
        .catch(() => undefined);
      await administrationPool
        .query(`DROP SCHEMA IF EXISTS "${restoredSchema}" CASCADE`)
        .catch(() => undefined);
      await administrationPool.end();
    }
  },
);

test(
  "PostgreSQL migrations and account repository operate together",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_POSTGRES_URL });
    try {
      const applied = await applyPostgresMigrations(pool, "self-host/postgres");
      const expectedMigrations = [
        "001_initial.sql",
        "002_learner_profiles.sql",
        "003_linked_identities.sql",
        "004_account_merges.sql",
        "005_learning_events.sql",
        "006_learning_record_receipts.sql",
        "007_secure_browser_sessions.sql",
        "008_authoritative_progress_imports.sql",
        "009_account_merge_governance_constraints.sql",
        "010_profile_consent_and_deletion_receipts.sql",
        "011_registration_boundary.sql",
        "012_admin_pagination_indexes.sql",
        "013_account_notification_outbox.sql",
      ];
      // Node runs test files concurrently against the same CI PostgreSQL
      // service. Another migration integration test may acquire the advisory
      // lock and apply the complete set first. A non-empty result must still
      // be the exact ordered set; an empty result proves the other runner
      // completed before this call acquired the lock.
      if (applied.length > 0) {
        assert.deepEqual(applied, expectedMigrations);
      }
      assert.deepEqual(
        await applyPostgresMigrations(pool, "self-host/postgres"),
        [],
      );

      const limiterBootstrapInstallation =
        `postgres-limiter-bootstrap-${crypto.randomUUID()}`;
      const limiterBootstrap = new PostgresAuthAbuseLimiter(pool);
      assert.equal(
        (
          await limiterBootstrap.check({
            installationId: limiterBootstrapInstallation,
            route: "start",
            clientAddress: "192.0.2.10",
          })
        ).allowed,
        true,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::integer AS count FROM installations WHERE id = $1",
            [limiterBootstrapInstallation],
          )
        ).rows[0].count,
        1,
      );

      const database = new PostgresD1CompatibilityDatabase(pool);
      const installationId = `postgres-integration-${crypto.randomUUID()}`;
      const repository = new D1Project42Repository(
        database,
        installationId,
      );
      const now = "2026-07-27T12:00:00.000Z";
      await repository.ensureInstallation(now);
      const identity = {
        issuer: "https://identity.example.test",
        subject: "owner-subject",
        email: "owner@example.test",
        emailVerified: true,
        displayName: "Owner",
        issuedAt: 1_785_153_600,
      };
      const account = await repository.createOrRefreshAccount(
        identity,
        true,
        "postgres-integration-request",
        now,
      );
      assert.equal(account.state, "approved");
      assert.deepEqual(account.roles, ["learner", "owner"]);
      assert.deepEqual(await repository.findAccount(identity), account);

      const initialProfile = await repository.getProfile(account, now);
      assert.deepEqual(initialProfile, {
        userId: account.id,
        displayName: "Owner",
        bio: null,
        organization: null,
        location: null,
        websiteUrl: null,
        locale: null,
        timeZone: null,
        reducedMotion: false,
        highContrast: false,
        photoAvailable: false,
        photoUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const profileUpdatedAt = "2026-07-27T12:00:30.000Z";
      const updatedProfile = await repository.updateProfile({
        account,
        request: {
          displayName: "PostgreSQL Owner",
          bio: "Portable profile integration fixture.",
          organization: "Example learning organization",
          location: "Remote",
          websiteUrl: "https://example.test/learner",
          locale: "en-US",
          timeZone: "America/New_York",
          reducedMotion: true,
          highContrast: true,
        },
        fields: [
          "displayName",
          "bio",
          "organization",
          "location",
          "websiteUrl",
          "locale",
          "timeZone",
          "reducedMotion",
          "highContrast",
        ],
        requestId: "postgres-profile-update",
        now: profileUpdatedAt,
      });
      assert.equal(updatedProfile.displayName, "PostgreSQL Owner");
      assert.equal(updatedProfile.createdAt, now);
      assert.equal(updatedProfile.updatedAt, profileUpdatedAt);
      assert.deepEqual(
        await repository.getProfile(account, profileUpdatedAt),
        updatedProfile,
      );
      const learnerExport = await repository.exportLearnerData({
        account,
        requestId: "postgres-profile-export",
        now: "2026-07-27T12:00:45.000Z",
      });
      assert.deepEqual(learnerExport.profile, updatedProfile);
      assert.equal(learnerExport.exportedAt, "2026-07-27T12:00:45.000Z");

      for (const suffix of ["a", "b"]) {
        await repository.createOrRefreshAccount(
          {
            ...identity,
            subject: `learner-subject-${suffix}`,
            email: `learner-${suffix}@example.test`,
            displayName: `Learner ${suffix.toUpperCase()}`,
          },
          false,
          `postgres-pagination-${suffix}`,
          now,
        );
      }
      const postgresAccountIds = [];
      let postgresAccountCursor;
      do {
        const page = await repository.listAccountPage({
          pageSize: 1,
          ...(postgresAccountCursor
            ? { cursor: postgresAccountCursor }
            : {}),
        });
        assert.equal(page.accounts.length, 1);
        assert.equal(page.accounts[0].installationId, installationId);
        postgresAccountIds.push(page.accounts[0].id);
        postgresAccountCursor = page.page.nextCursor ?? undefined;
      } while (postgresAccountCursor);
      assert.equal(postgresAccountIds.length, 3);
      assert.equal(new Set(postgresAccountIds).size, 3);
      const pendingAccounts = await repository.listAccountPage({
        state: "pending",
        pageSize: 100,
      });
      assert.equal(pendingAccounts.accounts.length, 2);
      assert.ok(
        pendingAccounts.accounts.every(
          (candidate) => candidate.state === "pending",
        ),
      );
      const pendingAccount = pendingAccounts.accounts[0];
      const pendingIdentity = {
        ...pendingAccount.identity,
        email: pendingAccount.primaryEmail,
        emailVerified: pendingAccount.emailVerified,
        displayName: pendingAccount.displayName,
        authenticatedAt: 1_785_153_600,
      };
      await repository.createRegistrationRequest({
        account: pendingAccount,
        identity: pendingIdentity,
        receiptTokenDigest: "e".repeat(64),
        requestId: "postgres-registration-receipt",
        now,
      });
      assert.deepEqual(
        await repository.getRegistrationStatus({
          receiptTokenDigest: "e".repeat(64),
          now,
        }),
        {
          state: "pending",
          requestedAt: now,
          updatedAt: now,
          canSignIn: false,
          nextAction: "await-review",
        },
      );
      await assert.rejects(
        repository.createBrowserSession({
          account: pendingAccount,
          identity: pendingIdentity,
          tokenDigest: "f".repeat(64),
          requestId: "postgres-pending-session-denied",
          now,
        }),
        (error) => error.code === "account_pending",
      );
      const approvedPendingAccount = await repository.changeAccountState({
        actor: account,
        targetId: pendingAccount.id,
        to: "approved",
        reason: "Approved by PostgreSQL integration test.",
        requestId: "postgres-account-approval",
        now: "2026-07-27T12:01:00.000Z",
      });
      assert.equal(approvedPendingAccount.state, "approved");
      await assert.rejects(
        repository.getRegistrationStatus({
          receiptTokenDigest: "e".repeat(64),
          now: "2026-07-27T12:01:00.000Z",
        }),
        (error) => error.code === "registration_receipt_invalid",
      );
      const revokedRegistrationReceipt = await pool.query(
        `SELECT r.revoked_at, u.active_registration_request_id
           FROM registration_requests r
           JOIN users u
             ON u.installation_id = r.installation_id AND u.id = r.user_id
          WHERE r.installation_id = $1 AND r.receipt_token_digest = $2`,
        [installationId, "e".repeat(64)],
      );
      assert.equal(
        revokedRegistrationReceipt.rows[0].revoked_at,
        "2026-07-27T12:01:00.000Z",
      );
      assert.equal(
        revokedRegistrationReceipt.rows[0].active_registration_request_id,
        null,
      );

      const postgresAuditIds = [];
      let postgresAuditCursor;
      do {
        const page = await repository.listAuditEventPage({
          pageSize: 1,
          ...(postgresAuditCursor ? { cursor: postgresAuditCursor } : {}),
        });
        assert.equal(page.events.length, 1);
        postgresAuditIds.push(page.events[0].id);
        postgresAuditCursor = page.page.nextCursor ?? undefined;
      } while (postgresAuditCursor);
      assert.ok(postgresAuditIds.length >= 3);
      assert.equal(new Set(postgresAuditIds).size, postgresAuditIds.length);

      const postgresReport = await runLearningRecordAdapterConformance(
        new SqlLearningEventStore(database),
        {
          installationId,
          learnerId: account.id,
          keyPrefix: "adapter-parity",
        },
      );
      assert.equal(postgresReport.event.contractVersion, "1.1");
      assert.equal(postgresReport.event.eventCountBeforeDeletion, 7);
      assert.equal(postgresReport.event.deletedEventCount, 7);
      assert.equal(postgresReport.receipt.exportedEventCount, 2);
      assert.equal(postgresReport.receipt.deletedEventCount, 2);
      assert.equal(postgresReport.receipt.replayedEventCount, 2);

      const sessionIdentity = {
        ...identity,
        authenticatedAt: 1_785_153_600,
      };
      const initialSession = await repository.createBrowserSession({
        account,
        identity: sessionIdentity,
        tokenDigest: "a".repeat(64),
        requestId: "postgres-session-create",
        now,
      });
      const resolvedSession = await repository.resolveBrowserSession(
        "a".repeat(64),
        now,
        "postgres-session-resolve",
      );
      assert.ok(resolvedSession);

      await pool.query(`
        CREATE FUNCTION reject_rotation_audit_for_test()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF NEW.action = 'session.rotate' THEN
            RAISE EXCEPTION 'session rotation audit unavailable';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER reject_rotation_audit_for_test
        BEFORE INSERT ON audit_events
        FOR EACH ROW
        EXECUTE FUNCTION reject_rotation_audit_for_test();
      `);
      await assert.rejects(
        () =>
          repository.rotateBrowserSession({
            session: resolvedSession,
            account,
            tokenDigest: "b".repeat(64),
            requestId: "postgres-session-audit-failure",
            now,
          }),
        /session rotation audit unavailable/,
      );
      const afterAuditFailure = await pool.query(
        `SELECT id, revoked_at, replaced_by_session_id
           FROM browser_sessions
          WHERE installation_id = $1 AND user_id = $2`,
        [installationId, account.id],
      );
      assert.deepEqual(afterAuditFailure.rows, [
        {
          id: initialSession.id,
          revoked_at: null,
          replaced_by_session_id: null,
        },
      ]);
      await pool.query(`
        DROP TRIGGER reject_rotation_audit_for_test ON audit_events;
        DROP FUNCTION reject_rotation_audit_for_test();
      `);

      const rotationResults = await Promise.allSettled([
        repository.rotateBrowserSession({
          session: resolvedSession,
          account,
          tokenDigest: "c".repeat(64),
          requestId: "postgres-session-race-a",
          now,
        }),
        repository.rotateBrowserSession({
          session: resolvedSession,
          account,
          tokenDigest: "d".repeat(64),
          requestId: "postgres-session-race-b",
          now,
        }),
      ]);
      assert.equal(
        rotationResults.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        rotationResults.filter((result) => result.status === "rejected").length,
        1,
      );
      assert.match(
        String(
          rotationResults.find((result) => result.status === "rejected")
            ?.reason,
        ),
        /Your session changed/,
      );
      const rotationRows = await pool.query(
        `SELECT
           count(*)::integer AS total,
           count(*) FILTER (WHERE revoked_at IS NULL)::integer AS active
         FROM browser_sessions
        WHERE installation_id = $1 AND user_id = $2`,
        [installationId, account.id],
      );
      assert.deepEqual(rotationRows.rows[0], { total: 2, active: 1 });
      const rotationAudit = await pool.query(
        `SELECT count(*)::integer AS count
           FROM audit_events
          WHERE installation_id = $1 AND action = 'session.rotate'`,
        [installationId],
      );
      assert.equal(rotationAudit.rows[0].count, 1);

      let limiterNow = new Date("2026-07-27T13:00:00.000Z");
      const limiter = new PostgresAuthAbuseLimiter(pool, {
        perClientLimit: 2,
        perInstallationLimit: 3,
        windowSeconds: 60,
        clock: () => limiterNow,
      });
      const limitInput = {
        installationId,
        route: "start",
        clientAddress: "192.0.2.42",
      };
      assert.equal((await limiter.check(limitInput)).allowed, true);
      assert.equal((await limiter.check(limitInput)).allowed, true);
      assert.equal((await limiter.check(limitInput)).allowed, false);
      assert.equal(
        (
          await limiter.check({
            ...limitInput,
            clientAddress: "192.0.2.43",
          })
        ).allowed,
        true,
      );
      assert.equal(
        (
          await limiter.check({
            ...limitInput,
            clientAddress: "192.0.2.44",
          })
        ).allowed,
        false,
      );
      limiterNow = new Date("2026-07-27T13:01:01.000Z");
      assert.equal((await limiter.check(limitInput)).allowed, true);

      const concurrentLimits = await Promise.all(
        Array.from({ length: 4 }, () =>
          limiter.check({
            ...limitInput,
            route: "callback",
            clientAddress: "198.51.100.42",
          }),
        ),
      );
      assert.deepEqual(
        concurrentLimits.map((decision) => decision.allowed).sort(),
        [false, false, true, true],
      );
      const boundedDeniedInstallation =
        `postgres-limiter-bounded-${crypto.randomUUID()}`;
      const boundedDeniedLimiter = new PostgresAuthAbuseLimiter(pool, {
        perClientLimit: 1,
        perInstallationLimit: 2,
        windowSeconds: 60,
        clock: () => limiterNow,
      });
      const boundedDeniedInput = {
        installationId: boundedDeniedInstallation,
        route: "start",
        clientAddress: "203.0.113.42",
      };
      assert.equal(
        (await boundedDeniedLimiter.check(boundedDeniedInput)).allowed,
        true,
      );
      const deniedDecisions = await Promise.all(
        Array.from({ length: 25 }, () =>
          boundedDeniedLimiter.check(boundedDeniedInput),
        ),
      );
      assert.ok(deniedDecisions.every((decision) => !decision.allowed));
      const boundedDeniedAudit = await pool.query(
        `SELECT count(*)::integer AS count
           FROM audit_events
          WHERE installation_id = $1
            AND action = 'auth.start.attempt'
            AND target_type = 'auth-abuse-denial-window'
            AND outcome = 'denied'`,
        [boundedDeniedInstallation],
      );
      assert.equal(boundedDeniedAudit.rows[0].count, 1);
      const rawAddressEvidence = await pool.query(
        `SELECT count(*)::integer AS count
           FROM audit_events
          WHERE installation_id = $1
            AND target_id IN ('192.0.2.42', '198.51.100.42')`,
        [installationId],
      );
      assert.equal(rawAddressEvidence.rows[0].count, 0);

      const miniflare = new Miniflare({
        compatibilityDate: "2026-07-28",
        d1Databases: { PROJECT42_DB: "project42-adapter-parity" },
        d1Persist: false,
        modules: true,
        script:
          "export default { fetch() { return new Response('fixture'); } };",
      });
      try {
        const d1 = await miniflare.getD1Database("PROJECT42_DB");
        await applyD1Migrations(d1);
        await d1
          .prepare("INSERT INTO installations VALUES (?, ?, ?, ?)")
          .bind(
            "adapter-parity",
            "Adapter parity",
            "2026-07-28T00:00:00.000Z",
            "2026-07-28T00:00:00.000Z",
          )
          .run();
        await d1
          .prepare(
            `INSERT INTO users (
               id, installation_id, display_name, primary_email,
               email_verified, account_state, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            "adapter-parity-learner",
            "adapter-parity",
            "Adapter parity learner",
            null,
            0,
            "approved",
            "2026-07-28T00:00:00.000Z",
            "2026-07-28T00:00:00.000Z",
          )
          .run();
        const d1Report = await runLearningRecordAdapterConformance(
          new SqlLearningEventStore(d1),
          {
            installationId: "adapter-parity",
            learnerId: "adapter-parity-learner",
            keyPrefix: "adapter-parity",
          },
        );
        const parity = verifyLearningRecordAdapterParity([
          { adapter: "cloudflare-d1", report: d1Report },
          { adapter: "postgresql", report: postgresReport },
        ]);
        assert.deepEqual(parity.adapters, ["cloudflare-d1", "postgresql"]);
        assert.deepEqual(parity.checks, [
          "contract-version",
          "semantic-fingerprint",
          "event-behavior",
          "receipt-behavior",
          "counts",
        ]);
      } finally {
        await miniflare.dispose();
      }
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT COUNT(*) AS count FROM learning_record_deletion_receipts",
            )
          ).rows[0].count,
        ),
        1,
      );
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT COUNT(*) AS count FROM learning_record_deletion_replays",
            )
          ).rows[0].count,
        ),
        1,
      );
      await assert.rejects(
        () =>
          pool.query(
            "UPDATE learning_record_deletion_receipts SET event_count = 0",
          ),
        /learning record receipts are immutable/,
      );
    } finally {
      await pool.end();
    }
  },
);

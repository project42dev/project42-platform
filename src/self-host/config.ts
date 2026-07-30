import {
  readLearningRecordAdapterConfiguration,
  type LearningRecordAdapterConfiguration,
} from "../learning-record-adapter.js";
import {
  readAccountMergeConsentRequirements,
  type AccountMergeConsentRequirement,
} from "../account-merge-policy.js";

export type SelfHostBrowserSessionConfiguration =
  | {
      mode: "disabled";
    }
  | {
      mode: "oidc";
      authorizationEndpoint: string;
      tokenEndpoint: string;
      clientId: string;
      clientSecret: string | null;
      redirectUri: string;
      logoutEndpoint: string | null;
      encryptionKey: string;
    };

export interface SelfHostConfiguration {
  port: number;
  publicUrl: URL;
  installationId: string;
  databaseUrl: string;
  databasePoolSize: number;
  databaseTls: boolean;
  oidcIssuer: string;
  oidcAudience: string;
  oidcJwksUrl: string;
  oidcEmailClaim: string;
  oidcEmailVerifiedClaim: string;
  allowedOrigins: string[];
  domainApprovalEnabled: boolean;
  bootstrapOwnerIssuer: string;
  bootstrapOwnerSubject: string;
  profilePhotoDirectory: string;
  migrationDirectory: string;
  learningRecordAdapter: LearningRecordAdapterConfiguration;
  accountMergeRequiredConsents: AccountMergeConsentRequirement[];
  accountNotificationAdapterModule: string | null;
  browserSession: SelfHostBrowserSessionConfiguration;
}

export function readConfiguration(
  environment: Record<string, string | undefined>,
): SelfHostConfiguration {
  const required = (name: string) => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const evaluationMode =
    environment.NODE_ENV === "evaluation" &&
    environment.PROJECT42_EVALUATION_MODE === "true";
  const serviceUrl = (name: string, evaluationHosts: string[] = ["localhost"]) => {
    const value = new URL(required(name));
    const allowedEvaluationUrl =
      evaluationMode &&
      value.protocol === "http:" &&
      evaluationHosts.includes(value.hostname);
    if (value.protocol !== "https:" && !allowedEvaluationUrl) {
      throw new Error(
        `${name} must use HTTPS (the local evaluation profile is the only exception)`,
      );
    }
    return value;
  };
  const browserHttpsUrl = (name: string) => {
    const value = serviceUrl(name, []);
    if (value.username || value.password || value.hash) {
      throw new Error(
        `${name} must not contain credentials or a fragment`,
      );
    }
    return value;
  };

  const databaseUrl = required("DATABASE_URL");
  if (
    /(?:password|secret|change-me|example|replace-with)/i.test(databaseUrl) &&
    environment.NODE_ENV === "production"
  ) {
    throw new Error("DATABASE_URL contains an unsafe production placeholder");
  }

  const allowedOrigins = required("ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedOrigins.includes("*")) {
    throw new Error("ALLOWED_ORIGINS cannot contain a wildcard");
  }
  for (const origin of allowedOrigins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) {
      throw new Error("ALLOWED_ORIGINS must contain exact origins");
    }
    if (
      parsed.protocol !== "https:" &&
      !(evaluationMode && parsed.protocol === "http:" && parsed.hostname === "localhost")
    ) {
      throw new Error("ALLOWED_ORIGINS must use HTTPS outside the local evaluation profile");
    }
  }

  const poolSize = Number(environment.DATABASE_POOL_SIZE ?? "10");
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 100) {
    throw new Error("DATABASE_POOL_SIZE must be an integer from 1 through 100");
  }
  const port = Number(environment.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 through 65535");
  }
  const accountNotificationAdapterModule =
    environment.ACCOUNT_NOTIFICATION_ADAPTER_MODULE?.trim() || null;
  if (
    accountNotificationAdapterModule &&
    /^(?:data|https?|node):/i.test(accountNotificationAdapterModule)
  ) {
    throw new Error(
      "ACCOUNT_NOTIFICATION_ADAPTER_MODULE must be a local file or installed package",
    );
  }

  const publicUrl = serviceUrl("PUBLIC_URL");
  const oidcIssuer = serviceUrl("OIDC_ISSUER");
  const browserSessionMode =
    environment.BROWSER_SESSION_MODE?.trim() ||
    (evaluationMode ? "disabled" : "oidc");
  if (browserSessionMode !== "disabled" && browserSessionMode !== "oidc") {
    throw new Error("BROWSER_SESSION_MODE must be disabled or oidc");
  }
  if (browserSessionMode === "disabled" && !evaluationMode) {
    throw new Error(
      "BROWSER_SESSION_MODE=disabled is permitted only in the local evaluation profile",
    );
  }

  let browserSession: SelfHostBrowserSessionConfiguration;
  if (browserSessionMode === "disabled") {
    browserSession = { mode: "disabled" };
  } else {
    if (publicUrl.protocol !== "https:" || oidcIssuer.protocol !== "https:") {
      throw new Error(
        "API-owned browser sessions require HTTPS PUBLIC_URL and OIDC_ISSUER values",
      );
    }
    const redirectUri = browserHttpsUrl("OIDC_REDIRECT_URI");
    if (
      redirectUri.origin !== publicUrl.origin ||
      redirectUri.pathname !== "/v1/auth/callback" ||
      redirectUri.search
    ) {
      throw new Error(
        "OIDC_REDIRECT_URI must be the API public origin followed by /v1/auth/callback",
      );
    }
    const encryptionKey = required("SESSION_ENCRYPTION_KEY");
    if (
      !/^[A-Za-z0-9_-]+$/.test(encryptionKey) ||
      Buffer.from(encryptionKey, "base64url").byteLength !== 32
    ) {
      throw new Error(
        "SESSION_ENCRYPTION_KEY must be a base64url-encoded 32-byte key",
      );
    }
    browserSession = {
      mode: "oidc",
      authorizationEndpoint: browserHttpsUrl(
        "OIDC_AUTHORIZATION_ENDPOINT",
      ).toString(),
      tokenEndpoint: browserHttpsUrl("OIDC_TOKEN_ENDPOINT").toString(),
      clientId: required("OIDC_CLIENT_ID"),
      clientSecret: environment.OIDC_CLIENT_SECRET?.trim() || null,
      redirectUri: redirectUri.toString(),
      logoutEndpoint: environment.OIDC_LOGOUT_ENDPOINT?.trim()
        ? browserHttpsUrl("OIDC_LOGOUT_ENDPOINT").toString()
        : null,
      encryptionKey,
    };
  }

  return {
    port,
    publicUrl,
    installationId: required("INSTALLATION_ID"),
    databaseUrl,
    databasePoolSize: poolSize,
    databaseTls: environment.DATABASE_TLS === "true",
    oidcIssuer: oidcIssuer.toString().replace(/\/$/, ""),
    oidcAudience: required("OIDC_AUDIENCE"),
    oidcJwksUrl: serviceUrl("OIDC_JWKS_URL", ["localhost", "identity"]).toString(),
    oidcEmailClaim: environment.OIDC_EMAIL_CLAIM?.trim() || "email",
    oidcEmailVerifiedClaim:
      environment.OIDC_EMAIL_VERIFIED_CLAIM?.trim() || "email_verified",
    allowedOrigins,
    domainApprovalEnabled: String(environment.DOMAIN_APPROVAL_ENABLED) === "true",
    bootstrapOwnerIssuer: environment.BOOTSTRAP_OWNER_ISSUER?.trim() ?? "",
    bootstrapOwnerSubject: environment.BOOTSTRAP_OWNER_SUBJECT?.trim() ?? "",
    profilePhotoDirectory:
      environment.PROFILE_PHOTO_DIRECTORY?.trim() || "data/profile-photos",
    migrationDirectory:
      environment.MIGRATION_DIRECTORY?.trim() || "self-host/postgres",
    learningRecordAdapter: readLearningRecordAdapterConfiguration(
      environment,
      "node",
    ),
    accountMergeRequiredConsents: readAccountMergeConsentRequirements(
      environment.ACCOUNT_MERGE_REQUIRED_CONSENTS,
    ),
    accountNotificationAdapterModule,
    browserSession,
  };
}

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
  migrationDirectory: string;
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

  return {
    port,
    publicUrl: serviceUrl("PUBLIC_URL"),
    installationId: required("INSTALLATION_ID"),
    databaseUrl,
    databasePoolSize: poolSize,
    databaseTls: environment.DATABASE_TLS === "true",
    oidcIssuer: serviceUrl("OIDC_ISSUER").toString().replace(/\/$/, ""),
    oidcAudience: required("OIDC_AUDIENCE"),
    oidcJwksUrl: serviceUrl("OIDC_JWKS_URL", ["localhost", "identity"]).toString(),
    oidcEmailClaim: environment.OIDC_EMAIL_CLAIM?.trim() || "email",
    oidcEmailVerifiedClaim:
      environment.OIDC_EMAIL_VERIFIED_CLAIM?.trim() || "email_verified",
    allowedOrigins,
    domainApprovalEnabled: String(environment.DOMAIN_APPROVAL_ENABLED) === "true",
    bootstrapOwnerIssuer: environment.BOOTSTRAP_OWNER_ISSUER?.trim() ?? "",
    bootstrapOwnerSubject: environment.BOOTSTRAP_OWNER_SUBJECT?.trim() ?? "",
    migrationDirectory:
      environment.MIGRATION_DIRECTORY?.trim() || "self-host/postgres",
  };
}

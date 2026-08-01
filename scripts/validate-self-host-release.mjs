import { readFile, readdir } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

const packageDocument = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(
  await readFile("self-host/compatibility.json", "utf8"),
);
const schema = JSON.parse(
  await readFile("self-host/compatibility.schema.json", "utf8"),
);
const compose = await readFile("self-host/compose.yaml", "utf8");
const secureCompose = await readFile("self-host/compose.https.yaml", "utf8");
const secureCaddyfile = await readFile("self-host/Caddyfile", "utf8");
const secureRealm = JSON.parse(
  await readFile("self-host/keycloak/project42-https-realm.json", "utf8"),
);
const exampleEnvironment = await readFile("self-host/.env.example", "utf8");
const secureExampleEnvironment = await readFile(
  "self-host/env.https.example",
  "utf8",
);
const secureBrowserDockerfile = await readFile(
  "self-host/browser-smoke/Dockerfile",
  "utf8",
);
const secureBrowserSeccomp = JSON.parse(
  await readFile("self-host/browser-smoke/seccomp_profile.json", "utf8"),
);
const secureBrowserSmoke = await readFile(
  "scripts/smoke-secure-browser-session.mjs",
  "utf8",
);
const secureBackupRestoreSmoke = await readFile(
  "self-host/smoke-secure-backup-restore.sh",
  "utf8",
);
const continuousIntegration = await readFile(
  ".github/workflows/ci.yml",
  "utf8",
);
const migrations = (await readdir("self-host/postgres"))
  .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
  .sort();

function composeServiceBlock(name) {
  const normalizedCompose = compose.replace(/\r\n/g, "\n");
  const marker = `  ${name}:\n`;
  const start = normalizedCompose.indexOf(marker);
  if (start === -1) {
    throw new Error(`Compose service ${name} is missing`);
  }
  const remainder = normalizedCompose.slice(start + marker.length);
  const nextService = remainder.search(/^  [a-z0-9][a-z0-9-]*:$/m);
  return nextService === -1 ? remainder : remainder.slice(0, nextService);
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
if (!validate(manifest)) {
  throw new Error(
    `Self-host compatibility manifest is invalid:\n${ajv.errorsText(
      validate.errors,
      { separator: "\n" },
    )}`,
  );
}
if (manifest.release !== packageDocument.version) {
  throw new Error("Compatibility release must equal package.json version");
}
if (manifest.api.version !== packageDocument.version) {
  throw new Error("Compatibility API version must equal package.json version");
}
if (!manifest.api.image.endsWith(`:${packageDocument.version}`)) {
  throw new Error("Compatibility image tag must equal package.json version");
}
if (migrations.at(-1) !== manifest.database.migrationHead) {
  throw new Error("Compatibility migration head does not match packaged migrations");
}
if (!compose.includes("PROJECT42_VERSION:-local")) {
  throw new Error("Compose must preserve an administrator-selected image version");
}
if (
  !exampleEnvironment.includes(
    `PROJECT42_VERSION=${packageDocument.version}`,
  )
) {
  throw new Error("Example environment version must equal package.json version");
}
if (
  !compose.includes(
    "LEARNING_RECORD_ADAPTER: ${PROJECT42_LEARNING_RECORD_ADAPTER:-postgresql}",
  )
) {
  throw new Error(
    "Compose must select the PostgreSQL learning-record adapter explicitly",
  );
}
const apiService = composeServiceBlock("api");
const apiHealthProbeFragments = [
  "healthcheck:",
  "require('node:http').get('http://127.0.0.1:8787/health'",
  "response.statusCode === 200",
  "interval: 10s",
  "timeout: 3s",
  "start_period: 20s",
  "retries: 6",
];
for (const fragment of apiHealthProbeFragments) {
  if (!apiService.includes(fragment)) {
    throw new Error(
      `Compose API readiness probe is missing required fragment: ${fragment}`,
    );
  }
}
if (
  manifest.database.learningRecords.semanticFingerprint !==
  "learning-records/1.1;events/1.1;receipts/1.0;append-only;atomic-batch;optimistic-revision;authoritative-progress-import;verified-deletion-replay"
) {
  throw new Error("Compatibility manifest learning-record semantics have drifted");
}
if (
  manifest.database.accountNotifications.deliveryDefault !== "disabled" ||
  manifest.database.accountNotifications.adapterContract !==
    "AccountNotificationAdapter" ||
  manifest.database.accountNotifications.adapterModuleVariable !==
    "ACCOUNT_NOTIFICATION_ADAPTER_MODULE" ||
  manifest.database.accountNotifications.auditActorKindField !==
    "metadata.actorKind" ||
  manifest.database.accountNotifications.auditProvenance.join(",") !==
    "owner,system" ||
  !compose.includes(
    "ACCOUNT_NOTIFICATION_ADAPTER_MODULE: ${PROJECT42_ACCOUNT_NOTIFICATION_ADAPTER_MODULE:-}",
  ) ||
  !exampleEnvironment.includes(
    "PROJECT42_ACCOUNT_NOTIFICATION_ADAPTER_MODULE=",
  )
) {
  throw new Error(
    "Reference self-host account notification delivery contract has drifted",
  );
}
if (manifest.supportLevel === "production" && compose.includes("start-dev")) {
  throw new Error("A production manifest cannot point to a development identity profile");
}

const secureTopologyFragments = [
  "NODE_ENV: production",
  "PUBLIC_URL: https://api.project42.localhost",
  "BROWSER_SESSION_MODE: oidc",
  "OIDC_REDIRECT_URI: https://api.project42.localhost/v1/auth/callback",
  "ALLOWED_ORIGINS: https://learn.project42.localhost",
  "NODE_EXTRA_CA_CERTS: /trust/root.crt",
  "KC_HOSTNAME: https://identity.project42.localhost",
  "KC_HTTP_ENABLED: \"true\"",
  "KC_PROXY_HEADERS: xforwarded",
  "NEXT_PUBLIC_PROJECT42_API_ORIGIN: https://api.project42.localhost",
  "identity.project42.internal",
  "trust-export:",
  "service_completed_successfully",
  "chmod 0444 /trust/root.crt",
  "--connect-to api.project42.localhost:443:gateway:443",
  "--connect-to identity.project42.localhost:443:gateway:443",
  "--connect-to learn.project42.localhost:443:gateway:443",
  "secure-topology-smoke:",
  "secure-browser-session-smoke:",
  "secure-backup-restore-smoke:",
  "BOOTSTRAP_OWNER_ISSUER: ${PROJECT42_BOOTSTRAP_OWNER_ISSUER:-}",
  "BOOTSTRAP_OWNER_SUBJECT: ${PROJECT42_BOOTSTRAP_OWNER_SUBJECT:-}",
  "PROJECT42_BROWSER_SMOKE_SUBJECT: ${PROJECT42_BROWSER_SMOKE_SUBJECT:-}",
  "cap_add:",
  "- SYS_CHROOT",
];
for (const fragment of secureTopologyFragments) {
  if (!secureCompose.includes(fragment)) {
    throw new Error(`Secure Compose topology is missing: ${fragment}`);
  }
}
for (const forbidden of [
  "\"8080:8080\"",
  "\"8787:8787\"",
  "PROJECT42_EVALUATION_MODE",
  "BROWSER_SESSION_MODE: disabled",
]) {
  if (secureCompose.includes(forbidden)) {
    throw new Error(`Secure Compose topology contains forbidden value: ${forbidden}`);
  }
}
for (const host of [
  "learn.project42.localhost",
  "api.project42.localhost",
  "identity.project42.localhost",
]) {
  if (!secureCaddyfile.includes(`https://${host}`)) {
    throw new Error(`Caddy is missing the HTTPS host ${host}`);
  }
}
if ((secureCaddyfile.match(/tls internal/g) ?? []).length !== 3) {
  throw new Error("Every browser-facing local host must use Caddy internal TLS");
}
if (
  !secureCaddyfile.includes("admin 127.0.0.1:2019") ||
  secureCaddyfile.includes("admin 0.0.0.0")
) {
  throw new Error("Caddy administration must remain loopback-only");
}
const secureClient = secureRealm.clients.find(
  (client) => client.clientId === "project42-api-browser",
);
if (
  !secureClient?.redirectUris?.includes(
    "https://api.project42.localhost/v1/auth/callback",
  ) ||
  !secureClient?.webOrigins?.includes("https://learn.project42.localhost") ||
  secureClient.publicClient !== true ||
  secureClient.attributes?.["pkce.code.challenge.method"] !== "S256"
) {
  throw new Error("Secure reference OIDC client contract has drifted");
}
if (
  !secureExampleEnvironment.includes(
    `PROJECT42_VERSION=${packageDocument.version}`,
  ) ||
  !secureExampleEnvironment.includes("PROJECT42_LEARN_SOURCE_REF=") ||
  !secureExampleEnvironment.includes("PROJECT42_SESSION_ENCRYPTION_KEY=replace-")
) {
  throw new Error("Secure example environment is incomplete or unsafe");
}
for (const fragment of [
  "mcr.microsoft.com/playwright:v1.55.1-noble",
  "libnss3-tools",
  'test "$(id -u pwuser)" = "1001"',
  'test "$(id -g pwuser)" = "1001"',
  "USER pwuser",
]) {
  if (!secureBrowserDockerfile.includes(fragment)) {
    throw new Error(`Secure browser image is missing: ${fragment}`);
  }
}
if (
  secureBrowserSeccomp.defaultAction !== "SCMP_ACT_ERRNO" ||
  !secureBrowserSeccomp.syscalls?.some(
    (rule) =>
      rule.action === "SCMP_ACT_ALLOW" &&
      ["clone", "setns", "unshare"].every((name) =>
        rule.names?.includes(name),
      ),
  )
) {
  throw new Error(
    "Secure browser must use the Playwright sandbox seccomp allowlist.",
  );
}
for (const fragment of [
  "chromium.launch",
  "chromiumSandbox: true",
  "--host-resolver-rules=",
  "__Secure-project42_session",
  "sessionCookie.secure",
  "sessionCookie.httpOnly",
  'sessionCookie.sameSite, "Lax"',
  "/v1/auth/session",
]) {
  if (!secureBrowserSmoke.includes(fragment)) {
    throw new Error(`Secure browser acceptance is missing: ${fragment}`);
  }
}
for (const forbidden of [
  "ignoreHTTPSErrors",
  "--ignore-certificate-errors",
  "--no-sandbox",
]) {
  if (secureBrowserSmoke.includes(forbidden)) {
    throw new Error(`Secure browser acceptance weakens security: ${forbidden}`);
  }
}
for (const fragment of [
  "pg_dump",
  "pg_restore",
  "sha256sum -c",
  "project42_schema_migrations",
  "directory_manifest",
  "source-identity",
  "source-caddy-data",
  "source-caddy-config",
  "restored-identity",
  "restored-caddy-data",
  "restored-caddy-config",
]) {
  if (!secureBackupRestoreSmoke.includes(fragment)) {
    throw new Error(`Secure backup/restore acceptance is missing: ${fragment}`);
  }
}
for (const fragment of [
  "scan-self-host-release.mjs",
  "aquasec/trivy:0.66.0",
  "fs --scanners secret --exit-code 1",
  "config --images",
  "sort --unique",
  "image --exit-code 1 --severity CRITICAL",
  "secure-browser-session-smoke",
  "secure-backup-restore-smoke",
]) {
  if (!continuousIntegration.includes(fragment)) {
    throw new Error(`Secure release CI is missing: ${fragment}`);
  }
}

console.log(
  `Validated self-host compatibility ${manifest.release} (${manifest.supportLevel}).`,
);

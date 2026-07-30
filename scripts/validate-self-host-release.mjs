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
const exampleEnvironment = await readFile("self-host/.env.example", "utf8");
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

console.log(
  `Validated self-host compatibility ${manifest.release} (${manifest.supportLevel}).`,
);

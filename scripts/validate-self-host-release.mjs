import { readFile, readdir } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import {
  calculateComponentDigest,
  manifestComponents,
} from "./release-component-digests.mjs";

const packageDocument = JSON.parse(await readFile("package.json", "utf8"));
const catalog = JSON.parse(await readFile("content/catalog.json", "utf8"));
const trainingPackage = JSON.parse(
  await readFile(
    "examples/training/language-models-and-generation/class-script.json",
    "utf8",
  ),
);
const manifestPath = process.argv[2] ?? "self-host/compatibility.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const schema = JSON.parse(
  await readFile("self-host/compatibility.schema.json", "utf8"),
);
const compose = await readFile("self-host/compose.yaml", "utf8");
const migrations = (await readdir("self-host/postgres"))
  .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
  .sort();

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
if (manifest.components.application.version !== packageDocument.version) {
  throw new Error("Application component version must equal package.json version");
}
if (manifest.components.content.version !== catalog.contentVersion) {
  throw new Error("Content component version must equal catalog contentVersion");
}
if (manifest.components.trainingPackage.version !== trainingPackage.version) {
  throw new Error("Training component version must equal the class-script package");
}
if (!manifest.api.image.endsWith(`:${packageDocument.version}`)) {
  throw new Error("Compatibility image tag must equal package.json version");
}
if (!manifest.learn.image.endsWith(`:${manifest.learn.version}`)) {
  throw new Error("Compatibility Learn image tag must equal its version");
}
if (migrations.at(-1) !== manifest.database.migrationHead) {
  throw new Error("Compatibility migration head does not match packaged migrations");
}
for (const component of manifestComponents(manifest)) {
  const calculated = await calculateComponentDigest(component);
  if (component.digest.value !== calculated.digest) {
    throw new Error(`Component digest drift: ${component.id}`);
  }
  if (JSON.stringify(component.artifacts) !== JSON.stringify(calculated.artifacts)) {
    throw new Error(`Component artifact digest drift: ${component.id}`);
  }
}
for (const migration of manifest.compatibility.requiredMigrations) {
  const componentArtifact = manifest.components.adapters
    .flatMap((adapter) => adapter.artifacts)
    .find((artifact) => artifact.path === migration.path);
  if (!componentArtifact || componentArtifact.sha256 !== migration.sha256) {
    throw new Error(`Required migration digest drift: ${migration.path}`);
  }
}
const expectedIdentity =
  `https://github.com/project42dev/project42-platform/.github/workflows/` +
  `release.yml@refs/tags/v${manifest.release}`;
if (manifest.integrityPolicy.certificateIdentity !== expectedIdentity) {
  throw new Error("Release certificate identity must bind the exact release tag");
}
for (const link of Object.values(manifest.releaseNotes)) {
  if (!link.includes(`v${manifest.release}`)) {
    throw new Error("Every release-note link must bind the exact release tag");
  }
}
if (!compose.includes("PROJECT42_VERSION:-local")) {
  throw new Error("Compose must preserve an administrator-selected image version");
}
if (!compose.includes(`PROJECT42_LEARN_VERSION:-${manifest.learn.version}`)) {
  throw new Error("Compose must preserve an administrator-selected Learn image version");
}
if (!compose.includes(`PROJECT42_LEARN_DIGEST:-${manifest.learn.digest}`)) {
  throw new Error("Compose must pin the compatible Learn image digest");
}
if (!compose.includes(manifest.learn.image.split(":")[0])) {
  throw new Error("Compose must use the compatible Learn OCI image");
}
if (manifest.supportLevel === "production" && compose.includes("start-dev")) {
  throw new Error("A production manifest cannot point to a development identity profile");
}

console.log(
  `Validated self-host compatibility ${manifest.release} (${manifest.supportLevel}).`,
);

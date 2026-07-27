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
if (!manifest.api.image.endsWith(`:${packageDocument.version}`)) {
  throw new Error("Compatibility image tag must equal package.json version");
}
if (migrations.at(-1) !== manifest.database.migrationHead) {
  throw new Error("Compatibility migration head does not match packaged migrations");
}
if (!compose.includes("PROJECT42_VERSION:-local")) {
  throw new Error("Compose must preserve an administrator-selected image version");
}
if (manifest.supportLevel === "production" && compose.includes("start-dev")) {
  throw new Error("A production manifest cannot point to a development identity profile");
}

console.log(
  `Validated self-host compatibility ${manifest.release} (${manifest.supportLevel}).`,
);

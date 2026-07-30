import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildReleaseManifest,
  sha256File,
  validateReleaseManifest,
} from "./release-governance-lib.mjs";

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(`invalid argument near ${key ?? "<end>"}`);
    }
    values.set(key.slice(2), value);
  }
  return values;
}

const arguments_ = parseArguments(process.argv.slice(2));
const releaseDirectory = resolve(arguments_.get("release-dir") ?? "release");
const packageMetadata = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const version = arguments_.get("version") ?? packageMetadata.version;
const sourceCommit =
  arguments_.get("source-commit") ?? process.env.GITHUB_SHA ?? process.env.PROJECT42_SOURCE_COMMIT;
const sourceRepository =
  arguments_.get("source-repository") ?? process.env.GITHUB_REPOSITORY ?? "project42dev/project42-platform";

const manifest = validateReleaseManifest(
  await buildReleaseManifest({
    releaseDirectory,
    version,
    sourceCommit,
    sourceRepository,
  }),
  version,
);
const manifestName = `project42-release-manifest-v${version}.json`;
const manifestPath = resolve(releaseDirectory, manifestName);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const checksumFiles = [...manifest.artifacts.map(({ file }) => file), manifestName].sort();
const checksumLines = [];
for (const file of checksumFiles) {
  checksumLines.push(`${await sha256File(resolve(releaseDirectory, file))}  ${file}`);
}
await writeFile(resolve(releaseDirectory, "SHA256SUMS"), `${checksumLines.join("\n")}\n`, "utf8");

console.log(`Generated ${manifestName} and SHA256SUMS for v${version}.`);

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateReleaseDirectory } from "./release-governance-lib.mjs";

function requireSection(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} is missing`);
  }
}

const packageMetadata = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const compatibility = JSON.parse(await readFile(resolve("self-host/compatibility.json"), "utf8"));
const version = packageMetadata.version;
if (compatibility.release !== version || compatibility.api?.version !== version) {
  throw new Error("package and compatibility versions must be identical");
}

const contributing = await readFile(resolve("CONTRIBUTING.md"), "utf8");
const support = await readFile(resolve("SUPPORT.md"), "utf8");
const changelog = await readFile(resolve("CHANGELOG.md"), "utf8");
const releaseNotes = await readFile(resolve("RELEASE_NOTES.md"), "utf8");

for (const [pattern, label] of [
  [/^## Development workflow$/m, "contributor development workflow"],
  [/^## Content and evidence requirements$/m, "content contribution policy"],
  [/^## Release responsibilities$/m, "release responsibility policy"],
  [/^## Security and privacy$/m, "contributor security policy"],
]) {
  requireSection(contributing, pattern, label);
}
for (const [pattern, label] of [
  [/^## Supported versions$/m, "supported-version policy"],
  [/^## Where to get help$/m, "support routing"],
  [/^## Response expectations$/m, "support expectations"],
  [/SECURITY\.md/, "security-report routing"],
]) {
  requireSection(support, pattern, label);
}
requireSection(changelog, new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m"), "current changelog entry");
requireSection(releaseNotes, new RegExp(`^# Project 42 platform v${version.replaceAll(".", "\\.")}$`, "m"), "release-note title");
for (const heading of ["Breaking changes", "Migrations", "Known limitations", "Rollback"]) {
  requireSection(releaseNotes, new RegExp(`^## ${heading}$`, "m"), `${heading} release guidance`);
}

const releaseDirectoryArgument = process.argv.find((argument) => argument.startsWith("--release-dir="));
if (releaseDirectoryArgument) {
  await validateReleaseDirectory(
    resolve(releaseDirectoryArgument.slice("--release-dir=".length)),
    version,
  );
}

console.log(`Release governance is valid for v${version}.`);

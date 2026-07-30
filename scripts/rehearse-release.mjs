import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { validateReleaseDirectory } from "./release-governance-lib.mjs";

const execFileAsync = promisify(execFile);

async function assertArchiveContains(archivePath, pattern, label) {
  const { stdout } = await execFileAsync("tar", ["-tf", archivePath], {
    timeout: 30_000,
    windowsHide: true,
  });
  if (!pattern.test(stdout.replaceAll("\\", "/"))) {
    throw new Error(`${label} is not independently consumable`);
  }
}

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
const evidencePath = resolve(
  arguments_.get("evidence") ??
    join(releaseDirectory, `project42-release-rehearsal-v${version}.json`),
);
const isolationRoot = await mkdtemp(join(tmpdir(), "project42-release-rehearsal-"));
const phases = [];
let cleanupCompleted = false;

try {
  const sourceManifest = await validateReleaseDirectory(releaseDirectory, version);
  phases.push({ name: "source-validation", result: "passed" });

  const registryDirectory = join(isolationRoot, "registry", `v${version}`);
  const consumerDirectory = join(isolationRoot, "consumer");
  await mkdir(registryDirectory, { recursive: true });
  await mkdir(consumerDirectory, { recursive: true });
  for (const file of [
    ...sourceManifest.artifacts.map(({ file }) => file),
    `project42-release-manifest-v${version}.json`,
    "SHA256SUMS",
  ]) {
    await cp(join(releaseDirectory, file), join(registryDirectory, file));
  }
  phases.push({ name: "isolated-publish", result: "passed" });

  const publishedManifest = await validateReleaseDirectory(registryDirectory, version);
  phases.push({ name: "published-integrity-verification", result: "passed" });

  const channelPath = join(isolationRoot, "registry", "current.json");
  const previousChannel = { tag: "v0.0.0-rehearsal-baseline" };
  await writeFile(channelPath, `${JSON.stringify(previousChannel)}\n`, "utf8");
  await writeFile(channelPath, `${JSON.stringify({ tag: `v${version}` })}\n`, "utf8");

  for (const artifact of publishedManifest.artifacts) {
    await cp(join(registryDirectory, artifact.file), join(consumerDirectory, artifact.file));
  }
  const consumedFiles = (
    await Promise.all(
      publishedManifest.artifacts.map(async ({ file }) => {
        await readFile(join(consumerDirectory, file));
        return file;
      }),
    )
  ).sort();
  if (consumedFiles.length !== publishedManifest.artifacts.length) {
    throw new Error("consumer did not receive every release artifact");
  }
  await assertArchiveContains(
    join(consumerDirectory, `project42-platform-v${version}.tgz`),
    /(?:^|\n)package\/package\.json(?:\r?\n|$)/,
    "platform archive",
  );
  await assertArchiveContains(
    join(consumerDirectory, `project42-content-v${version}.tar.gz`),
    /(?:^|\n)content\/catalog\.json(?:\r?\n|$)/,
    "content archive",
  );
  await assertArchiveContains(
    join(consumerDirectory, `project42-migrations-v${version}.tar.gz`),
    /(?:^|\n)migrations\/\d+_[^\r\n]+\.sql(?:\r?\n|$)/,
    "migration archive",
  );
  const consumedCompatibility = JSON.parse(
    await readFile(
      join(consumerDirectory, `project42-compatibility-v${version}.json`),
      "utf8",
    ),
  );
  if (
    consumedCompatibility.release !== version ||
    consumedCompatibility.api?.version !== version
  ) {
    throw new Error("consumed compatibility metadata does not match the release");
  }
  phases.push({ name: "isolated-consume", result: "passed" });

  await writeFile(channelPath, `${JSON.stringify(previousChannel)}\n`, "utf8");
  const rolledBackChannel = JSON.parse(await readFile(channelPath, "utf8"));
  if (rolledBackChannel.tag !== previousChannel.tag) {
    throw new Error("rollback did not restore the previous channel pointer");
  }
  phases.push({ name: "channel-rollback", result: "passed" });
} finally {
  await rm(isolationRoot, { recursive: true, force: true });
  cleanupCompleted = true;
}

const evidence = {
  schemaVersion: 1,
  release: `v${version}`,
  isolation: "temporary-local-filesystem",
  productionMutation: false,
  credentialsRequired: false,
  phases,
  cleanup: {
    temporaryEnvironmentRemoved: cleanupCompleted,
  },
  result:
    cleanupCompleted && phases.length === 5 && phases.every(({ result }) => result === "passed")
      ? "passed"
      : "failed",
};
if (evidence.result !== "passed") {
  throw new Error("release rehearsal did not complete every required phase");
}
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(`Release rehearsal passed; evidence written to ${evidencePath}.`);

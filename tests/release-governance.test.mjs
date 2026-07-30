import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildReleaseManifest,
  sha256File,
  validateReleaseDirectory,
  validateReleaseManifest,
} from "../scripts/release-governance-lib.mjs";

const version = "1.2.3";
const sourceCommit = "0123456789abcdef0123456789abcdef01234567";

async function createReleaseFixture(root, { evidence = false } = {}) {
  const files = {
    [`project42-platform-v${version}.tgz`]: "platform",
    [`project42-content-v${version}.tar.gz`]: "content",
    [`project42-migrations-v${version}.tar.gz`]: "migrations",
    [`project42-compatibility-v${version}.json`]: JSON.stringify({
      release: version,
      supportLevel: "supported",
      api: { version },
      database: { migrationHead: "0016_example.sql" },
      update: { signature: "sigstore-keyless" },
    }),
  };
  if (evidence) {
    files[`project42-release-rehearsal-v${version}.json`] = '{"result":"passed"}';
  }
  await mkdir(root, { recursive: true });
  for (const [file, contents] of Object.entries(files)) {
    await writeFile(join(root, file), contents, "utf8");
  }
}

test("release manifests are deterministic, complete, and strictly validated", async () => {
  const root = await mkdtemp(join(tmpdir(), "project42-manifest-test-"));
  try {
    await createReleaseFixture(root);
    const first = await buildReleaseManifest({
      releaseDirectory: root,
      version,
      sourceCommit,
    });
    const second = await buildReleaseManifest({
      releaseDirectory: root,
      version,
      sourceCommit,
    });
    assert.deepEqual(first, second);
    validateReleaseManifest(first, version);
    assert.deepEqual(
      first.artifacts.map(({ role }) => role).sort(),
      ["compatibility", "content", "migrations", "platform"],
    );

    assert.throws(
      () => validateReleaseManifest({ ...first, unexpected: true }, version),
      /unexpected fields/,
    );
    assert.throws(
      () =>
        validateReleaseManifest(
          { ...first, policy: { ...first.policy, automaticApply: true } },
          version,
        ),
      /explicit, rollback-capable/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release directory validation rejects artifact and checksum tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "project42-directory-test-"));
  try {
    await createReleaseFixture(root, { evidence: true });
    const manifest = await buildReleaseManifest({
      releaseDirectory: root,
      version,
      sourceCommit,
    });
    const manifestName = `project42-release-manifest-v${version}.json`;
    await writeFile(join(root, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
    const files = [...manifest.artifacts.map(({ file }) => file), manifestName].sort();
    const lines = [];
    for (const file of files) {
      lines.push(`${await sha256File(join(root, file))}  ${file}`);
    }
    await writeFile(join(root, "SHA256SUMS"), `${lines.join("\n")}\n`);
    await validateReleaseDirectory(root, version);

    const platformPath = join(root, `project42-platform-v${version}.tgz`);
    await writeFile(platformPath, "tampered", "utf8");
    await assert.rejects(() => validateReleaseDirectory(root, version), /integrity check failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release rehearsal is explicitly local and cleans its temporary environment", async () => {
  const source = await readFile(
    new URL("../scripts/rehearse-release.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /mkdtemp/);
  assert.match(source, /productionMutation: false/);
  assert.match(source, /credentialsRequired: false/);
  assert.match(source, /temporaryEnvironmentRemoved/);
  assert.match(source, /rm\(isolationRoot, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\b(?:docker|gh|wrangler|az)\b/);
});

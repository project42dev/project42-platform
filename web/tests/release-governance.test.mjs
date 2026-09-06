import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createManifest,
  rehearseRelease,
  validateRelease,
} from "../scripts/release-governance.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

test("current release contract is complete", async () => {
  const result = await validateRelease(repositoryRoot);
  assert.equal(result.version, "0.19.0");
});

test("missing release-note risk disclosure is rejected", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "project42-release-fixture-"));
  try {
    for (const directory of [".github/workflows", "public"]) {
      await mkdir(join(fixture, directory), { recursive: true });
    }
    for (const file of [
      "package.json",
      "CHANGELOG.md",
      "RELEASE_NOTES.md",
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "SUPPORT.md",
      ".github/workflows/release.yml",
      "public/release-facts.json",
    ]) {
      const source = join(repositoryRoot, file);
      const target = join(fixture, file);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, await readFile(source));
    }
    const notesPath = join(fixture, "RELEASE_NOTES.md");
    const notes = await readFile(notesPath, "utf8");
    await writeFile(
      notesPath,
      notes.replace(/## Rollback[\s\S]*$/, "## Rollback\n\n"),
    );
    await assert.rejects(
      validateRelease(fixture),
      /section "Rollback" is empty or missing/,
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("manifest publication, consumption, rollback, and cleanup are reproducible", async () => {
  const releaseDirectory = join(repositoryRoot, ".release-test");
  try {
    await mkdir(releaseDirectory, { recursive: true });
    await writeFile(join(releaseDirectory, "artifact.json"), '{"ok":true}\n');
    const manifest = await createManifest({
      root: repositoryRoot,
      output: ".release-test/release-manifest.json",
      source: "0123456789abcdef0123456789abcdef01234567",
      tag: "v0.19.0",
      artifacts: [".release-test/artifact.json"],
    });
    assert.equal(manifest.artifacts.length, 1);
    const evidence = await rehearseRelease({
      root: repositoryRoot,
      manifestPath: ".release-test/release-manifest.json",
      output: ".release-test/rehearsal-evidence.json",
    });
    assert.equal(evidence.rollbackCompleted, true);
    assert.equal(evidence.cleanupVerified, true);
    assert.equal(evidence.productionMutation, false);
  } finally {
    await rm(releaseDirectory, { recursive: true, force: true });
  }
});

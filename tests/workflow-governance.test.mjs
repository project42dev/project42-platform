import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowsDirectory = join(repositoryRoot, ".github", "workflows");
const releasePath = join(workflowsDirectory, "release.yml");

function normalize(source) {
  return source.replaceAll("\r\n", "\n");
}

function assertImmutableActionReferences(source, label) {
  for (const match of normalize(source).matchAll(/^\s*-?\s*uses:\s*[^@\s]+@([^\s#]+)/gm)) {
    assert.match(
      match[1],
      /^[0-9a-f]{40}$/,
      `${label} contains a mutable action reference: ${match[0].trim()}`,
    );
  }
}

function assertSafeReleaseWorkflow(source, label) {
  const normalized = normalize(source);
  const jobsIndex = normalized.indexOf("\njobs:\n");
  const validateIndex = normalized.indexOf("\n  validate:\n");
  const releaseIndex = normalized.indexOf("\n  release:\n");

  assert.ok(jobsIndex > 0, `${label} must define jobs`);
  assert.ok(validateIndex > jobsIndex, `${label} must define a manual validation job`);
  assert.ok(releaseIndex > validateIndex, `${label} must isolate the publication job`);

  const preamble = normalized.slice(0, jobsIndex);
  const validateBlock = normalized.slice(validateIndex, releaseIndex);
  const releaseBlock = normalized.slice(releaseIndex);

  assert.match(preamble, /^  workflow_dispatch:\s*$/m);
  assert.match(preamble, /\npermissions:\n  contents: read\n$/);
  assert.match(validateBlock, /^    if: github\.event_name == 'workflow_dispatch'$/m);
  assert.match(validateBlock, /\n    permissions:\n      contents: read\n/);
  assert.match(
    releaseBlock,
    /^    if: github\.event_name == 'push' && github\.ref_type == 'tag' && startsWith\(github\.ref, 'refs\/tags\/v'\)$/m,
  );

  const forbiddenManualCapabilities = [
    /\b(?:contents|packages|id-token|attestations|artifact-metadata): write\b/,
    /\bsecrets\./,
    /actions\/(?:attest|upload-|deploy-)/,
    /\bdocker\b/,
    /\bcosign\b/,
    /\bgh release\b/,
    /\bgit push\b/,
    /--push\b/,
    /^\s+environment:/m,
  ];

  for (const forbidden of forbiddenManualCapabilities) {
    assert.doesNotMatch(
      validateBlock,
      forbidden,
      `${label} manual validation must not have publication capability ${forbidden}`,
    );
  }
}

test("all workflow actions use immutable commit SHAs", () => {
  for (const fileName of readdirSync(workflowsDirectory)) {
    if (!/\.ya?ml$/i.test(fileName)) {
      continue;
    }
    const workflowPath = join(workflowsDirectory, fileName);
    assertImmutableActionReferences(readFileSync(workflowPath, "utf8"), fileName);
  }
});

test("manual release dispatch validates without publishing", () => {
  const releaseSource = readFileSync(releasePath, "utf8");
  assertSafeReleaseWorkflow(releaseSource, "release.yml");
});

test("release governance rejects publication-boundary regressions", () => {
  const releaseSource = normalize(readFileSync(releasePath, "utf8"));

  assert.throws(() =>
    assertSafeReleaseWorkflow(
      releaseSource.replace("github.event_name == 'push' && github.ref_type == 'tag' && ", ""),
      "missing-event-guard",
    ),
  );
  assert.throws(() =>
    assertSafeReleaseWorkflow(
      releaseSource.replace("\n  release:\n", "\n      - run: gh release create v0.0.0\n\n  release:\n"),
      "manual-publication-command",
    ),
  );
  assert.throws(() =>
    assertSafeReleaseWorkflow(
      releaseSource.replace(
        "    permissions:\n      contents: read\n    steps:",
        "    permissions:\n      contents: read\n      id-token: write\n    steps:",
      ),
      "manual-write-permission",
    ),
  );

  const mutableReference = releaseSource.replace(
    /@[0-9a-f]{40} # v7/,
    "@v7",
  );
  assert.throws(() => assertImmutableActionReferences(mutableReference, "mutable-action"));
});

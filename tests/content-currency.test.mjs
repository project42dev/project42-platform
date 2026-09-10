// The gate that exists because project-42.dev served a review date
// project42-content had retracted. A gate nothing exercises is a gate nobody
// knows is working, so each case here builds a pair of trees that diverge in
// one specific way and asserts the check fails naming that divergence.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const checker = path.resolve(import.meta.dirname, "..", "scripts", "check-content-currency.mjs");

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// A minimal upstream: a git checkout holding one resource with one citation.
function makeUpstream(dates) {
  const root = mkdtempSync(path.join(tmpdir(), "p42-upstream-"));
  writeJson(path.join(root, "catalog.json"), { contentVersion: "0.0.1" });
  writeJson(path.join(root, "resources", "demo", "demo-resource.json"), {
    id: "demo-resource",
    lastVerified: dates.resource,
    sources: [{ title: "Demo", url: "https://example.test/", lastVerified: dates.source }],
  });
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
  git("init", "--quiet");
  git("config", "user.email", "gate@example.test");
  git("config", "user.name", "Gate Fixture");
  git("add", "-A");
  git("commit", "--quiet", "--no-gpg-sign", "-m", "fixture");
  return { root, head: git("rev-parse", "HEAD").trim() };
}

// A minimal platform: the installed curriculum plus the pin that records where
// it came from.
function makePlatform(dates, pin) {
  const root = mkdtempSync(path.join(tmpdir(), "p42-platform-"));
  writeJson(path.join(root, "content", "catalog.json"), { contentVersion: "0.0.1" });
  writeJson(path.join(root, "content", "resources", "demo", "demo-resource.json"), {
    id: "demo-resource",
    lastVerified: dates.resource,
    sources: [{ title: "Demo", url: "https://example.test/", lastVerified: dates.source }],
  });
  writeJson(path.join(root, "config", "content.lock.json"), {
    schemaVersion: 1,
    source: "https://github.com/project42dev/project42-content",
    upstream: { commit: pin },
    files: {},
  });
  return root;
}

function runCheck(platformRoot, upstreamRoot) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [checker, "--root", platformRoot, "--source", upstreamRoot],
      { encoding: "utf8", stdio: "pipe" },
    );
    return { status: 0, output: stdout };
  } catch (error) {
    return {
      status: error.status,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

test("a served review date that upstream does not record fails the check", () => {
  const upstream = makeUpstream({ resource: "2026-07-26", source: "2026-07-26" });
  // The incident in miniature: the platform serves the mechanical uplift,
  // upstream records the day the source was actually read.
  const platform = makePlatform({ resource: "2026-08-23", source: "2026-07-26" }, upstream.head);
  try {
    const result = runCheck(platform, upstream.root);
    assert.equal(result.status, 1);
    assert.match(
      result.output,
      /resources\/demo\/demo-resource\.json :: \/lastVerified :: served=2026-08-23 upstream=2026-07-26/,
    );
  } finally {
    rmSync(platform, { recursive: true, force: true });
    rmSync(upstream.root, { recursive: true, force: true });
  }
});

test("a divergent date inside a citation fails the check", () => {
  const upstream = makeUpstream({ resource: "2026-07-26", source: "2026-07-26" });
  const platform = makePlatform({ resource: "2026-07-26", source: "2026-08-23" }, upstream.head);
  try {
    const result = runCheck(platform, upstream.root);
    assert.equal(result.status, 1);
    assert.match(
      result.output,
      /\/sources\/0\/lastVerified :: served=2026-08-23 upstream=2026-07-26/,
    );
  } finally {
    rmSync(platform, { recursive: true, force: true });
    rmSync(upstream.root, { recursive: true, force: true });
  }
});

test("a pin left behind upstream fails the check even when every date still matches", () => {
  const upstream = makeUpstream({ resource: "2026-07-26", source: "2026-07-26" });
  const platform = makePlatform(
    { resource: "2026-07-26", source: "2026-07-26" },
    "0000000000000000000000000000000000000000",
  );
  try {
    const result = runCheck(platform, upstream.root);
    assert.equal(result.status, 1);
    assert.match(result.output, /pin drift/);
  } finally {
    rmSync(platform, { recursive: true, force: true });
    rmSync(upstream.root, { recursive: true, force: true });
  }
});

test("matching trees at the recorded pin pass", () => {
  const upstream = makeUpstream({ resource: "2026-07-26", source: "2026-07-26" });
  const platform = makePlatform({ resource: "2026-07-26", source: "2026-07-26" }, upstream.head);
  try {
    const result = runCheck(platform, upstream.root);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Every date this platform serves matches/);
  } finally {
    rmSync(platform, { recursive: true, force: true });
    rmSync(upstream.root, { recursive: true, force: true });
  }
});

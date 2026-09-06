// The inheritance contract, asserted rather than described.
//
// The claim this repository makes is: an upstream curriculum update lands
// without losing a local module. That is worth a test because the failure mode
// is silent -- a sync that overwrote custom/ would look like a successful sync,
// and the loss would only surface when a learner could not find a lesson.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatalogFromPath, mergeCatalogs } from "@project42/platform";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// A minimal stand-in for the upstream content repository, so the test needs
// neither a network nor a particular checkout to exist.
function makeUpstream(root, options) {
  writeJson(path.join(root, "catalog.json"), {
    contentVersion: options.contentVersion,
    paths: [
      {
        id: "ai-foundations",
        title: "AI Foundations",
        level: "beginner",
        summary: "Inherited path.",
        moduleIds: ["what-ai-does"],
      },
    ],
    modules: [],
    resources: [],
    providers: [{ id: "anthropic", name: "Anthropic", description: "Inherited provider." }],
  });
  writeJson(path.join(root, "modules", "what-ai-does.json"), {
    id: "what-ai-does",
    pathId: "ai-foundations",
    title: options.moduleTitle,
  });
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@localhost");
  git(root, "config", "user.name", "test");
  git(root, "add", "-A");
  git(root, "commit", "-qm", `upstream ${options.contentVersion}`);
}

async function merged(downstream) {
  const upstream = await loadCatalogFromPath(path.join(downstream, "upstream"));
  const custom = await loadCatalogFromPath(path.join(downstream, "custom"));
  return mergeCatalogs(upstream, [custom]);
}

test("an upstream update lands without losing a local module", async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-inherit-"));
  try {
    const upstreamSource = path.join(scratch, "upstream-source");
    const downstream = path.join(scratch, "downstream");
    mkdirSync(upstreamSource, { recursive: true });

    // A downstream repository is this one, plus a local module.
    cpSync(repositoryRoot, downstream, {
      recursive: true,
      filter: (from) => !from.includes("node_modules") && !from.includes(`${path.sep}dist`),
    });
    writeJson(path.join(downstream, "custom", "modules", "house-style.json"), {
      id: "house-style",
      pathId: "ai-foundations",
      title: "Our house style for prompts",
    });
    writeJson(path.join(downstream, "custom", "catalog.json"), {
      contentVersion: "0.1.0",
      paths: [{ id: "ai-foundations", moduleIds: ["house-style"] }],
      modules: [],
      resources: [],
      providers: [],
    });

    const sync = path.join(downstream, "scripts", "sync-upstream.mjs");

    // Generation 1.
    makeUpstream(upstreamSource, { contentVersion: "1.0.0", moduleTitle: "What AI does" });
    execFileSync(process.execPath, [sync, "--source", upstreamSource], {
      cwd: downstream,
      stdio: "pipe",
    });

    const first = await merged(downstream);
    assert.ok(
      first.modules.some((entry) => entry.id === "house-style"),
      "the local module must survive the first install",
    );
    assert.equal(
      first.modules.find((entry) => entry.id === "what-ai-does").title,
      "What AI does",
    );
    assert.deepEqual(
      [...first.paths.find((entry) => entry.id === "ai-foundations").moduleIds].sort(),
      ["house-style", "what-ai-does"],
      "the local module must be attached to the inherited path",
    );

    // Generation 2: upstream retitles a module and bumps its version.
    rmSync(path.join(upstreamSource, ".git"), { recursive: true, force: true });
    makeUpstream(upstreamSource, {
      contentVersion: "1.1.0",
      moduleTitle: "What AI actually does",
    });
    execFileSync(process.execPath, [sync, "--source", upstreamSource], {
      cwd: downstream,
      stdio: "pipe",
    });

    const second = await merged(downstream);
    assert.ok(
      second.modules.some((entry) => entry.id === "house-style"),
      "the local module must survive an upstream update -- this is the contract",
    );
    assert.equal(
      second.modules.find((entry) => entry.id === "what-ai-does").title,
      "What AI actually does",
      "the upstream update must actually land",
    );
    assert.deepEqual(
      [...second.paths.find((entry) => entry.id === "ai-foundations").moduleIds].sort(),
      ["house-style", "what-ai-does"],
    );

    const lock = JSON.parse(
      readFileSync(path.join(downstream, "config", "content.lock.json"), "utf8"),
    );
    assert.equal(lock.contentVersion, "1.1.0", "the lock must record what was installed");

    // A clean tree passes its own check.
    execFileSync(process.execPath, [sync, "--check"], { cwd: downstream, stdio: "pipe" });

    // And the lock must detect a hand-edit of inherited material.
    writeJson(path.join(downstream, "upstream", "modules", "what-ai-does.json"), {
      id: "what-ai-does",
      pathId: "ai-foundations",
      title: "Edited in the wrong repository",
    });
    assert.throws(
      () =>
        execFileSync(process.execPath, [sync, "--check"], { cwd: downstream, stdio: "pipe" }),
      "editing inherited curriculum must fail the check",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

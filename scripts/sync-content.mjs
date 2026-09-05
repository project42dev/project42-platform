// Installs the canonical curriculum from project42-content into content/.
//
// docs/architecture.md names project42-content "THE CANONICAL CONTENT REPO --
// raw, host-agnostic, schema-validated curriculum data". Layer 3 consumers take
// it by upstream sync. This script is that sync.
//
// It replaced a version that never contacted the content repo at all: it
// created an empty custom-content/ directory and re-ran the local generator
// over whatever happened to be committed here. The two copies drifted by a
// whole learning path and 100 KB of catalogue while both declared
// contentVersion 0.42.0, and nothing could detect it.
//
// content/ therefore stays committed -- Principle 5 requires an air-gapped
// build, so building must not need the network -- but it is now an INSTALLED
// ARTIFACT, not source. config/content.lock.json records the upstream commit
// and a hash of every installed file, and --check re-verifies the tree against
// that lock without touching the network. Editing curriculum here instead of
// upstream now fails the build.
//
//   node scripts/sync-content.mjs                  # install from a sibling checkout
//   node scripts/sync-content.mjs --source <path>  # install from an explicit checkout
//   node scripts/sync-content.mjs --check          # verify the installed tree (CI)

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const contentRoot = path.join(root, "content");
const lockPath = path.join(root, "config", "content.lock.json");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const sourceIndex = args.indexOf("--source");
const sourceRoot = path.resolve(
  sourceIndex >= 0 ? args[sourceIndex + 1] : path.join(root, "..", "project42-content"),
);

// Exactly the curriculum data. The content repo's own scaffolding -- README,
// licence, package.json, scripts, tests, templates, docs -- is not curriculum
// and must not leak into a consumer.
const SYNCED_ENTRIES = [
  "catalog.json",
  "diagrams",
  "modules",
  "opportunity-registry.json",
  "reference",
  "resource-packs",
  "resources",
  "source-registry.json",
  "training",
];

const TEXT_EXTENSIONS = [".json", ".md", ".mmd", ".svg", ".csv", ".txt", ".yaml", ".yml"];

// Derived here, not authored upstream. generate-training-packages writes these
// from the training scripts every build, so locking them would make the lock
// fail on its own generator: any curriculum change would demand a second
// upstream commit just to re-record what this repository had recomputed.
// They are still policed -- by training:check, which is the gate that owns them.
const GENERATED_HERE = new Set(["training/coverage.json"]);

function assertInside(parent, target) {
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe content path: ${target}`);
  }
}

async function filesUnder(entryPath, prefix) {
  let entries;
  try {
    entries = await readdir(entryPath, { withFileTypes: true });
  } catch (error) {
    // A plain file, e.g. catalog.json.
    if (error?.code === "ENOTDIR") return [{ relative: prefix, absolute: entryPath }];
    throw error;
  }
  const output = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Curriculum may not contain symlinks: ${path.posix.join(prefix, entry.name)}`);
    }
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(entryPath, entry.name);
    if (entry.isDirectory()) output.push(...(await filesUnder(absolute, relative)));
    else if (entry.isFile()) output.push({ relative, absolute });
  }
  return output;
}

async function hashFile(file) {
  const bytes = await readFile(file);
  // Curriculum is text authored on two platforms; normalise line endings so a
  // checkout difference is never mistaken for a content difference.
  const content = TEXT_EXTENSIONS.includes(path.extname(file).toLowerCase())
    ? bytes.toString("utf8").replace(/^﻿/, "").replaceAll("\r\n", "\n")
    : bytes;
  return createHash("sha256").update(content).digest("hex");
}

async function inventory(base) {
  const files = {};
  for (const entry of SYNCED_ENTRIES) {
    const absolute = path.join(base, entry);
    await access(absolute);
    for (const file of await filesUnder(absolute, entry)) {
      if (GENERATED_HERE.has(file.relative)) continue;
      files[file.relative] = await hashFile(file.absolute);
    }
  }
  return files;
}

if (checkOnly) {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const actual = await inventory(contentRoot);
  const expected = lock.files;

  const missing = Object.keys(expected).filter((file) => !(file in actual));
  const added = Object.keys(actual).filter((file) => !(file in expected));
  const changed = Object.keys(expected).filter(
    (file) => file in actual && actual[file] !== expected[file],
  );

  if (missing.length || added.length || changed.length) {
    const detail = [
      missing.length ? `missing ${missing.length} (${missing.slice(0, 3).join(", ")})` : "",
      added.length ? `added ${added.length} (${added.slice(0, 3).join(", ")})` : "",
      changed.length ? `changed ${changed.length} (${changed.slice(0, 3).join(", ")})` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `content/ differs from the curriculum locked at project42-content@${lock.upstream.commit}: ` +
        `${detail}. Curriculum is authored upstream, never here -- change it in ` +
        "project42-content and re-run: npm run content:sync",
    );
  }

  const catalog = JSON.parse(await readFile(path.join(contentRoot, "catalog.json"), "utf8"));
  if (catalog.contentVersion !== lock.contentVersion) {
    throw new Error(
      `catalog.json declares contentVersion ${catalog.contentVersion}, the lock records ` +
        `${lock.contentVersion}`,
    );
  }

  console.log(
    `Verified ${Object.keys(actual).length} curriculum files against ` +
      `project42-content@${lock.upstream.commit} (contentVersion ${lock.contentVersion}).`,
  );
  process.exit(0);
}

// ---- Install ---------------------------------------------------------------

try {
  await access(sourceRoot);
} catch {
  throw new Error(
    `No project42-content checkout at ${sourceRoot}. Clone it beside this repository, or pass ` +
      "--source <path>.",
  );
}

const upstreamCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: sourceRoot,
  encoding: "utf8",
}).trim();

// Refuse to lock a dirty checkout. A lock that names a commit but holds
// uncommitted bytes is a lock that lies.
const dirty = execFileSync("git", ["status", "--porcelain"], {
  cwd: sourceRoot,
  encoding: "utf8",
}).trim();
if (dirty) {
  throw new Error(
    `project42-content at ${sourceRoot} has uncommitted changes. Commit them first so the lock ` +
      "records something reproducible.",
  );
}

// Validate the source before touching the installed tree, so a broken upstream
// cannot leave content/ half-written.
await inventory(sourceRoot);

// Files this repository generates survive the install untouched. Each synced
// entry is removed before being recopied, which would delete them, so they are
// held aside and put back. training:check owns them and requires them to match
// what the generator computes here; taking upstream's copy makes that gate fail
// on a file the sync had no business touching.
const preserved = new Map();
for (const relative of GENERATED_HERE) {
  try {
    preserved.set(relative, await readFile(path.join(contentRoot, relative)));
  } catch {
    // Nothing to preserve on a first install; the generator writes it.
  }
}

await mkdir(contentRoot, { recursive: true });
for (const entry of SYNCED_ENTRIES) {
  const source = path.join(sourceRoot, entry);
  const target = path.join(contentRoot, entry);
  assertInside(sourceRoot, source);
  assertInside(contentRoot, target);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, {
    recursive: true,
    filter: (from) =>
      !GENERATED_HERE.has(path.relative(sourceRoot, from).split(path.sep).join("/")),
  });
}

for (const [relative, bytes] of preserved) {
  const target = path.join(contentRoot, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

const installed = await inventory(contentRoot);
const catalog = JSON.parse(await readFile(path.join(contentRoot, "catalog.json"), "utf8"));

await mkdir(path.dirname(lockPath), { recursive: true });
await writeFile(
  lockPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: "https://github.com/project42dev/project42-content",
      upstream: { commit: upstreamCommit },
      contentVersion: catalog.contentVersion,
      files: installed,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `Installed ${Object.keys(installed).length} curriculum files from ` +
    `project42-content@${upstreamCommit} (contentVersion ${catalog.contentVersion}).`,
);

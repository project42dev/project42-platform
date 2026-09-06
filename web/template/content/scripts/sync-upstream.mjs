// Installs the inherited curriculum from an upstream Project 42 content
// repository into upstream/, and hash-locks exactly what it installed.
//
// This is the downstream half of the content-inheritance contract:
//
//   upstream/   INHERITED. Owned by the upstream repository. Replaced wholesale
//               on every sync, and hash-locked in config/content.lock.json so a
//               drifted or hand-edited copy fails the build instead of shipping.
//   custom/     YOURS. Never read, never written, never deleted by this script.
//               An upstream update cannot lose a local module, because a local
//               module does not live anywhere this script touches.
//
// The two are merged into a single catalogue by scripts/build-catalog.mjs. That
// separation is the whole design: inheritance is a directory boundary rather
// than a merge conflict.
//
//   node scripts/sync-upstream.mjs                  # install from a sibling checkout
//   node scripts/sync-upstream.mjs --source <path>  # install from an explicit checkout
//   node scripts/sync-upstream.mjs --check          # verify upstream/ against the lock
//
// --check never touches the network or the source: CI does not check the
// upstream repository out, and a gate that needs the thing it is guarding
// against is not a gate.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const upstreamRoot = path.join(root, "upstream");
const lockPath = path.join(root, "config", "content.lock.json");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const sourceIndex = args.indexOf("--source");
const sourceRoot = path.resolve(
  sourceIndex >= 0 ? args[sourceIndex + 1] : path.join(root, "..", "project42-content"),
);

// Exactly the curriculum data. The upstream repository's own scaffolding --
// README, licence, package.json, scripts, tests, templates, docs -- is not
// curriculum and must not leak into a consumer.
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

// Every text form the curriculum is authored in. An extension missing from
// this list is hashed as raw bytes, so on a platform where git rewrites line
// endings on checkout a fresh clone fails its own lock check having changed
// nothing -- which is how ".vtt" was found: 40 caption files, 41 differences,
// on the first clean checkout anyone made on Windows.
const TEXT_EXTENSIONS = [
  ".csv",
  ".json",
  ".md",
  ".mmd",
  ".py",
  ".svg",
  ".txt",
  ".vtt",
  ".yaml",
  ".yml",
];

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
    if (error?.code === "ENOTDIR") return [{ relative: prefix, absolute: entryPath }];
    if (error?.code === "ENOENT") return [];
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
  // Curriculum is text authored on several platforms; normalise line endings so
  // a checkout difference is never mistaken for a content difference.
  const content = TEXT_EXTENSIONS.includes(path.extname(file).toLowerCase())
    ? bytes.toString("utf8").replace(/^﻿/, "").replaceAll("\r\n", "\n")
    : bytes;
  return createHash("sha256").update(content).digest("hex");
}

async function inventory(base) {
  const files = {};
  for (const entry of SYNCED_ENTRIES) {
    const absolute = path.join(base, entry);
    try {
      await access(absolute);
    } catch {
      // An upstream that does not publish every optional entry is fine.
      continue;
    }
    for (const file of await filesUnder(absolute, entry)) {
      files[file.relative] = await hashFile(file.absolute);
    }
  }
  return files;
}

if (checkOnly) {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  if (!lock.upstream?.commit) {
    console.log("No upstream installed yet. Run: npm run content:sync");
    process.exit(0);
  }
  const actual = await inventory(upstreamRoot);
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
      `upstream/ differs from the curriculum locked at ${lock.upstream.commit}: ${detail}. ` +
        "Inherited curriculum is authored upstream, never here. Your own modules " +
        "belong in custom/, which this check does not police and no sync overwrites.",
    );
  }

  console.log(
    `Verified ${Object.keys(actual).length} inherited curriculum files against ` +
      `${lock.source}@${lock.upstream.commit} (contentVersion ${lock.contentVersion}).`,
  );
  process.exit(0);
}

// ---- Install ---------------------------------------------------------------

try {
  await access(sourceRoot);
} catch {
  throw new Error(
    `No upstream content checkout at ${sourceRoot}. Clone it beside this repository, ` +
      "or pass --source <path>.",
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
    `The upstream checkout at ${sourceRoot} has uncommitted changes. Commit them ` +
      "first so the lock records something reproducible.",
  );
}

// Validate the source before touching the installed tree, so a broken upstream
// cannot leave upstream/ half-written.
await inventory(sourceRoot);

await mkdir(upstreamRoot, { recursive: true });
for (const entry of SYNCED_ENTRIES) {
  const source = path.join(sourceRoot, entry);
  const target = path.join(upstreamRoot, entry);
  assertInside(sourceRoot, source);
  assertInside(upstreamRoot, target);
  try {
    await access(source);
  } catch {
    continue;
  }
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

const installed = await inventory(upstreamRoot);
const catalog = JSON.parse(await readFile(path.join(upstreamRoot, "catalog.json"), "utf8"));
const existingLock = JSON.parse(await readFile(lockPath, "utf8"));

await mkdir(path.dirname(lockPath), { recursive: true });
await writeFile(
  lockPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: existingLock.source,
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
  `Installed ${Object.keys(installed).length} inherited curriculum files from ` +
    `${existingLock.source}@${upstreamCommit} (contentVersion ${catalog.contentVersion}). ` +
    "custom/ was not touched.",
);

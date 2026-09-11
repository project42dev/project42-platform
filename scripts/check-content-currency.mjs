// Fails when the review dates this repository SERVES differ from the review
// dates project42-content RECORDS.
//
// Why this exists
// ---------------
// On 2026-09-06 project42-content retracted a review-date uplift that had never
// been earned (commit 3d4b093, "undo the review dates that were never earned"):
// 663 citations across 151 files were rolled back from a mechanical
// 2026-08-23 bump to the day each source was actually read. The platform was
// pinned at bb00b9a, the commit immediately before it, and stayed there. Four
// days later project-42.dev was still telling learners a resource had been
// reviewed on 2026-08-23 and was "Current" until 2026-10-22, when the source of
// truth said 2026-07-26. Production asserted a freshness the content repository
// had publicly withdrawn.
//
// Nothing caught it, and nothing could have:
//
//   * content:check (sync-content.mjs --check) verifies the installed tree
//     against config/content.lock.json. The lock records the PINNED commit, so
//     a tree that faithfully reproduces a retracted pin passes forever. It
//     answers "does content/ match what we installed", never "is what we
//     installed still true".
//   * content:freshness read the dates in content/ and found them 18 days old
//     against a 30-day cadence. The fabricated dates made the freshness gate
//     GREEN. The gate was measuring the fabrication.
//   * content-sync.yml runs weekly, and its last run before the retraction was
//     2026-09-06 03:04 UTC -- fifteen hours before the retraction landed.
//     project42-content has no workflow that dispatches content_updated, so the
//     cron is the only vector that ever fires.
//
// So this check compares against upstream itself, not against the pin. It is
// deliberately NOT part of `npm run check`: Principle 5 requires an air-gapped
// build, and this needs a project42-content checkout. It runs as its own CI job
// with both repositories checked out.
//
// What it enforces
// ----------------
//   1. config/content.lock.json pins the commit project42-content is actually
//      at. A pin left behind is how this incident happened.
//   2. Every date-only value the platform serves equals the value at the same
//      JSON location upstream.
//
// Rule 2 compares every YYYY-MM-DD string at every JSON pointer, not a list of
// known field names. lastVerified is the field that caused the incident, but
// the curriculum also serves asOf, evidenceReviewedAt, verifiedAt, reviewBy,
// observedAt, lastReviewed, measuredOn, renderedAt and asOfDate, and a field
// added tomorrow would not be on any list written today. Anything shaped like a
// date is covered the moment it is authored.
//
//   node scripts/check-content-currency.mjs
//   node scripts/check-content-currency.mjs --source ../project42-content
//
// --root exists so the check can be pointed at a constructed pair of trees and
// proved to fail. A gate nothing exercises is a gate nobody knows is working;
// tests/content-currency.test.mjs uses it.

import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const rootIndex = process.argv.indexOf("--root");
const root =
  rootIndex >= 0
    ? path.resolve(process.argv[rootIndex + 1])
    : path.resolve(import.meta.dirname, "..");
const contentRoot = path.join(root, "content");
const lockPath = path.join(root, "config", "content.lock.json");

const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const sourceRoot = path.resolve(
  sourceIndex >= 0 ? args[sourceIndex + 1] : path.join(root, "..", "project42-content"),
);

// The curriculum entries sync-content.mjs installs. Kept in step with that
// list; anything outside it is the content repository's own scaffolding and is
// never served.
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

// Written by this repository's generators from the synced training scripts, not
// authored upstream. sync-content.mjs excludes it from the lock for the same
// reason; training:check is the gate that owns it.
const GENERATED_HERE = new Set(["training/coverage.json"]);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const failures = [];

function fail(message) {
  failures.push(message);
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

// Every .json file under the synced entries, keyed by its path relative to the
// curriculum root, so the two trees line up file for file.
async function jsonFilesUnder(base) {
  const found = new Map();
  for (const entry of SYNCED_ENTRIES) {
    const absolute = path.join(base, entry);
    if (!(await exists(absolute))) continue;
    await collect(absolute, entry);
  }
  return found;

  async function collect(absolute, relative) {
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOTDIR") throw error;
      if (absolute.endsWith(".json")) found.set(relative, absolute);
      return;
    }
    for (const entry of entries) {
      const childRelative = path.posix.join(relative, entry.name);
      const childAbsolute = path.join(absolute, entry.name);
      if (entry.isDirectory()) await collect(childAbsolute, childRelative);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        found.set(childRelative, childAbsolute);
      }
    }
  }
}

// Every date-only string in a document, addressed by JSON pointer. A pointer is
// stable across both trees while they hold the same shape, and when the shape
// differs the pointer diff is itself the divergence being looked for.
function datesByPointer(document) {
  const dates = new Map();
  visit(document, "");
  return dates;

  function visit(node, pointer) {
    if (typeof node === "string") {
      if (DATE_ONLY.test(node)) dates.set(pointer, node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${pointer}/${index}`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        visit(value, `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
      }
    }
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function gitOutput(cwd, ...gitArgs) {
  return execFileSync("git", ["-C", cwd, ...gitArgs], { encoding: "utf8" }).trim();
}

if (!(await exists(sourceRoot))) {
  console.error(
    `No project42-content checkout at ${sourceRoot}. Pass --source <path>; this check compares against upstream and cannot run without it.`,
  );
  process.exit(2);
}

const lock = await readJson(lockPath);

// 1. The pin.
let upstreamHead = null;
try {
  upstreamHead = gitOutput(sourceRoot, "rev-parse", "HEAD");
} catch {
  console.error(
    `${sourceRoot} is not a git checkout, so the pin in config/content.lock.json cannot be compared with upstream.`,
  );
  process.exit(2);
}

let dirty = "";
try {
  dirty = gitOutput(sourceRoot, "status", "--porcelain");
} catch {
  dirty = "";
}
if (dirty) {
  console.warn(
    `WARN ${sourceRoot} has uncommitted changes; the comparison below is against its working tree, not against ${upstreamHead.slice(0, 7)}.`,
  );
}

if (lock.upstream?.commit !== upstreamHead) {
  fail(
    `pin drift :: config/content.lock.json pins project42-content@${(lock.upstream?.commit ?? "none").slice(0, 7)} but the content repository is at ${upstreamHead.slice(0, 7)}. Run: npm run content:sync -- --source <checkout>`,
  );
}

// 2. The dates.
const servedFiles = await jsonFilesUnder(contentRoot);
const upstreamFiles = await jsonFilesUnder(sourceRoot);

let compared = 0;
const relativePaths = [...new Set([...servedFiles.keys(), ...upstreamFiles.keys()])].sort();

for (const relative of relativePaths) {
  if (GENERATED_HERE.has(relative)) continue;
  const servedPath = servedFiles.get(relative);
  const upstreamPath = upstreamFiles.get(relative);

  if (servedPath && !upstreamPath) {
    const served = datesByPointer(await readJson(servedPath));
    for (const [pointer, date] of served) {
      fail(
        `${relative} :: ${pointer} :: served=${date} upstream=<file not in project42-content>`,
      );
    }
    continue;
  }
  if (!servedPath && upstreamPath) {
    const upstream = datesByPointer(await readJson(upstreamPath));
    for (const [pointer, date] of upstream) {
      fail(`${relative} :: ${pointer} :: served=<file not installed> upstream=${date}`);
    }
    continue;
  }

  const served = datesByPointer(await readJson(servedPath));
  const upstream = datesByPointer(await readJson(upstreamPath));
  for (const pointer of new Set([...served.keys(), ...upstream.keys()])) {
    compared += 1;
    const servedDate = served.get(pointer) ?? "<absent>";
    const upstreamDate = upstream.get(pointer) ?? "<absent>";
    if (servedDate !== upstreamDate) {
      fail(`${relative} :: ${pointer} :: served=${servedDate} upstream=${upstreamDate}`);
    }
  }
}

for (const failure of failures) console.error(`ERROR ${failure}`);

console.log(
  `Compared ${compared} served date(s) across ${relativePaths.length} curriculum document(s) against project42-content@${upstreamHead.slice(0, 7)}.`,
);

if (failures.length > 0) {
  const dateDivergences = failures.filter((failure) => !failure.startsWith("pin drift"));
  console.error(
    dateDivergences.length > 0
      ? `\n${failures.length} divergence(s), ${dateDivergences.length} of them dates this platform serves that project42-content does not record. Re-sync with: npm run content:sync -- --source ${sourceRoot}`
      : `\n${failures.length} divergence(s). Every served date still matches, but the pin is behind upstream, so the next upstream correction will be served stale. Re-sync with: npm run content:sync -- --source ${sourceRoot}`,
  );
  process.exit(1);
}

console.log("Every date this platform serves matches the date project42-content records.");

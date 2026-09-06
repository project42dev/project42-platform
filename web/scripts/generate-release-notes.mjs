import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// Compiles CHANGELOG.md into the JSON the /releases page renders.
//
// The changelog stays the source of truth, exactly as release-facts.json keeps
// package.json as the source for versions. A hand-maintained copy on the page
// would be a second place to update and a second place to be wrong, which is
// the whole reason the About page says "one source, no mystery numbers".
//
// Run with --check in CI to fail when the committed JSON has drifted.
const projectRoot = path.resolve(import.meta.dirname, "..");
const changelogPath = path.join(projectRoot, "CHANGELOG.md");
const outputPath = path.join(projectRoot, "config", "release-notes.json");

function parseChangelog(markdown) {
  const releases = [];
  // "## [0.19.0] - 2026-07-30" or "## [Unreleased]"
  const heading = /^##\s+\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
  let current = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const match = heading.exec(rawLine);
    if (match) {
      current = { version: match[1], date: match[2] ?? null, changes: [] };
      releases.push(current);
      continue;
    }
    if (!current) continue;
    const bullet = /^[-*]\s+(.*)$/.exec(rawLine.trim());
    if (bullet) {
      current.changes.push(bullet[1].trim());
      continue;
    }
    // A wrapped bullet continues the previous entry rather than starting one.
    const continuation = rawLine.trim();
    if (continuation && current.changes.length > 0 && /^\s+/.test(rawLine)) {
      current.changes[current.changes.length - 1] += ` ${continuation}`;
    }
  }

  return releases.filter((release) => release.changes.length > 0);
}

async function main() {
  const markdown = await readFile(changelogPath, "utf8");
  const releases = parseChangelog(markdown);
  if (releases.length === 0) {
    throw new Error("No releases parsed from CHANGELOG.md");
  }
  const payload = `${JSON.stringify({ $schemaVersion: 1, releases }, null, 2)}\n`;

  if (process.argv.includes("--check")) {
    const existing = await readFile(outputPath, "utf8").catch(() => "");
    if (existing !== payload) {
      throw new Error(
        "config/release-notes.json is stale. Run npm run releases:generate.",
      );
    }
    console.log(`Release notes current: ${releases.length} releases.`);
    return;
  }

  await writeFile(outputPath, payload);
  console.log(`Release notes written: ${releases.length} releases.`);
}

await main();

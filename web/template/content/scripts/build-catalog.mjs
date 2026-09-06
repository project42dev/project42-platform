// Merges the inherited curriculum in upstream/ with this organisation's own
// material in custom/, and writes the single catalogue a front end consumes.
//
// The merge itself is not implemented here. It is `mergeCatalogs` from
// @project42/platform, the same function the platform's own overlay model uses,
// so "what happens when an id collides" has one answer in one place:
//
//   path      merged   -- a path that exists upstream keeps its upstream title
//                         and summary unless you override them, and its
//                         moduleIds are the union of both, so adding one module
//                         to an inherited path is a two-line change
//   module    replaced -- yours wins outright
//   resource  replaced -- yours wins outright
//   provider  added    -- upstream's entry is kept if the id already exists
//
// Anything with an id upstream has never heard of is simply added.
//
//   node scripts/build-catalog.mjs            # writes dist/
//   node scripts/build-catalog.mjs --check    # fails if dist/ is stale

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCatalogFromPath, mergeCatalogs } from "@project42/platform";

const root = path.resolve(import.meta.dirname, "..");
const upstreamRoot = path.join(root, "upstream");
const customRoot = path.join(root, "custom");
const outputRoot = path.join(root, "dist");
const checkOnly = process.argv.includes("--check");

try {
  await access(path.join(upstreamRoot, "catalog.json"));
} catch {
  throw new Error(
    "No inherited curriculum installed. Run: npm run content:sync",
  );
}

const upstream = await loadCatalogFromPath(upstreamRoot);
const custom = await loadCatalogFromPath(customRoot);
const merged = mergeCatalogs(upstream, [custom]);

// The merged catalogue declares the custom layer's contentVersion when there is
// one, because a consumer pinning "the curriculum" is pinning what this
// repository publishes, not what it inherited. The inherited version is
// recorded alongside so the provenance is never lost.
const inheritedVersion = upstream.contentVersion;
merged.contentVersion = custom.contentVersion ?? inheritedVersion;
merged.inheritedFrom = {
  contentVersion: inheritedVersion,
  commit: JSON.parse(await readFile(path.join(root, "config", "content.lock.json"), "utf8"))
    .upstream.commit,
};

const serialized = `${JSON.stringify(merged, null, 2)}\n`;
const outputPath = path.join(outputRoot, "catalog.json");

if (checkOnly) {
  let existing;
  try {
    existing = await readFile(outputPath, "utf8");
  } catch {
    throw new Error(`${outputPath} has not been built. Run: npm run content:build`);
  }
  if (existing !== serialized) {
    throw new Error(
      `${outputPath} is stale relative to upstream/ and custom/. Run: npm run content:build`,
    );
  }
} else {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
}

const localModules = new Set((custom.modules ?? []).map((entry) => entry.id));
const localPaths = new Set((custom.paths ?? []).map((entry) => entry.id));
const upstreamModules = new Set((upstream.modules ?? []).map((entry) => entry.id));

console.log(
  [
    `${merged.paths.length} path(s), ${merged.modules.length} module(s), ` +
      `${(merged.resources ?? []).length} resource(s).`,
    `Inherited contentVersion ${inheritedVersion}; publishing ${merged.contentVersion}.`,
    `${localModules.size} local module(s), ${localPaths.size} local path entr(y|ies); ` +
      `${[...localModules].filter((id) => upstreamModules.has(id)).length} override an ` +
      "inherited module.",
  ].join("\n"),
);

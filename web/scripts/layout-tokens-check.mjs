#!/usr/bin/env node
// Fails the build when a layout bundle's composition-token vocabulary drifts
// from the declared canonical list (web/layouts/composition-tokens.json).
//
// Why this exists (AB#T-25)
// -------------------------
// T-18 added nine tokens (--p42-radius-{4xs,3xs,2xs,xs}, --p42-track-wide-1..5)
// to every layout.json in this repository. web/tests/token-completeness.test.mjs
// already asserts every layout in web/layouts/ declares the SAME set as the
// others -- but T-18 changed all three consistently, so that check stayed
// green. Nothing here compared the new set against anything OUTSIDE this
// repository, so project42-gallery's own copies (and its separately
// hand-maintained required-token list) fell behind silently. The drift was
// only caught later, downstream, by a consuming portal's own
// token-completeness check -- by which point it had already shipped.
//
// The fix is a declared list a human has to edit, so adding a token is a
// visible diff to a file other repositories can read and pin against, not an
// invisible-by-construction change to three files that happen to agree with
// each other. This script is that gate for THIS repository; project42-gallery
// vendors composition-tokens.json (scripts/sync-platform-layouts.mjs) to
// derive its own required-token list instead of hand-maintaining a parallel
// one that can fall behind the same way.
//
// Run as part of `npm run web:check`, which `npm run check` depends on -- so
// this is caught at the source, in CI, before a release ships, not only when
// a downstream consumer happens to run its own check.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const layoutsRoot = path.join(root, "layouts");
const canonicalPath = path.join(layoutsRoot, "composition-tokens.json");

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const canonical = JSON.parse(await readFile(canonicalPath, "utf8"));
const canonicalTokens = canonical.tokens;

check(
  Array.isArray(canonicalTokens) && canonicalTokens.length > 0,
  `${canonicalPath} declares no tokens`,
);
check(
  JSON.stringify([...canonicalTokens].sort()) === JSON.stringify(canonicalTokens),
  `${canonicalPath} is not sorted -- keep it sorted so a diff shows exactly what changed`,
);

const entries = (await readdir(layoutsRoot, { withFileTypes: true })).filter(
  (entry) => entry.isDirectory(),
);
check(entries.length > 0, "no layout bundles found under web/layouts");

for (const entry of entries) {
  const manifestPath = path.join(layoutsRoot, entry.name, "layout.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const declared = new Set(Object.keys(manifest.tokens ?? {}));

  const missing = canonicalTokens.filter((token) => !declared.has(token));
  const extra = [...declared].filter((token) => !canonicalTokens.includes(token)).sort();

  check(
    missing.length === 0,
    `${entry.name}/layout.json is missing ${missing.length} token(s) declared in web/layouts/composition-tokens.json: ${missing.join(", ")}. ` +
      "Add them to layout.json (and regenerate layout.css) or this layout renders those surfaces with no value at all.",
  );
  check(
    extra.length === 0,
    `${entry.name}/layout.json declares ${extra.length} token(s) outside web/layouts/composition-tokens.json: ${extra.join(", ")}. ` +
      "Add them to composition-tokens.json first -- that file is what every other layout, and project42-gallery's vendored copy, is measured against.",
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${entries.length} layout bundle(s) against ${canonicalTokens.length} canonical composition token(s).`,
  );
}

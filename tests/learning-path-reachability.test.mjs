// On the night of 2026-09-11, /learn/paths listed learning paths by walking a
// hardcoded id allow-list -- a switch statement naming eight specific path
// ids. `path.focusArea` has never been set on any path in any catalogue, so
// every path fell to that switch, and the six paths whose ids the switch
// didn't recognise (ai-literacy-and-mental-models,
// developer-and-practitioner-ai, agentic-systems-and-mcp,
// rag-and-fine-tuning-engineering, self-hosted-and-aiops,
// ai-security-and-governance -- 22 modules) rendered no card and no link.
// Their pages still built and were in the sitemap; a learner could reach
// them only by typing the exact URL from memory.
//
// The defect class is "the list quietly omitted things", so the gate has to
// enumerate the catalogue and check every entry survives the site's own
// routing logic, rather than pin the six names that happened to be missing
// tonight. A fixed list here would be exactly the bug it exists to catch.
//
// This repository ships no React/Next toolchain on purpose (see
// tests/web-distribution.test.mjs's header) -- there is no way to render
// web/app/learn/paths/page.tsx here and click through it like a browser
// would. So this test does the two things that together are equivalent to
// that link-walk without a renderer:
//
//   1. Runs the exact function both /learn/paths and /ondemand call to
//      decide what gets a link (`groupPathsByFocusArea`) against the real,
//      loaded catalogue, and asserts every path comes out placed somewhere.
//   2. Statically checks that the pages actually delegate to that function
//      instead of their own logic, and -- the check tonight's bug would
//      have failed -- that neither page's source contains a literal
//      catalogue path id. A hardcoded id in a page that lists paths is an
//      allow-list (or a silent-drop list) in embryo; the old switch
//      statement is exactly what this rules out from recurring, wherever it
//      might be reintroduced.
//
// One gap this cannot close: nothing in this repository type-checks
// web/app/**/*.tsx (no Next build runs here -- see web-distribution.test.mjs
// again). A TypeScript error in a page is caught by the adopter's own
// `next build`, not by anything in this repo's `npm run check`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../scripts/load-catalog.mjs";
import { groupPathsByFocusArea, FALLBACK_GROUP_ID } from "../web/lib/focusAreaGroups.ts";
import { defaultFocusAreas } from "../web/lib/focusAreas.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const LISTING_PAGES = [
  "web/app/learn/paths/page.tsx",
  "web/app/ondemand/page.tsx",
];

test("every catalogue path is placed in a rendered group by /learn/paths -- none silently dropped", async () => {
  const catalog = await loadCatalog(repoRoot);
  const allPathIds = catalog.paths.map((path) => path.id);
  assert.ok(allPathIds.length > 0, "sanity: the catalogue actually has paths");

  const groups = groupPathsByFocusArea(catalog.paths, defaultFocusAreas);
  const placedIds = groups.flatMap((group) => group.paths.map((path) => path.id));

  // Every path appears -- the enumeration, not a fixed list, is the check.
  const missing = allPathIds.filter((id) => !placedIds.includes(id));
  assert.deepEqual(missing, [], `paths unreachable from /learn/paths: ${missing.join(", ")}`);

  // No path appears twice (would indicate a path counted in two groups).
  assert.equal(placedIds.length, new Set(placedIds).size, "a path must belong to exactly one group");

  // No path is quietly lost between "grouped" and "rendered": every group
  // that exists in the output actually holds at least one path (groupPaths
  // already filters empty groups, but pin that behaviour so a future change
  // can't reintroduce an empty, dead section).
  for (const group of groups) {
    assert.ok(group.paths.length > 0, `group ${group.id} rendered with no paths`);
  }
});

test("a path with no recognised focusArea lands in the labelled fallback group, not nowhere", async () => {
  const catalog = await loadCatalog(repoRoot);
  const groups = groupPathsByFocusArea(catalog.paths, defaultFocusAreas);
  const fallback = groups.find((group) => group.id === FALLBACK_GROUP_ID);

  // Today, focusArea is unset on every path in the catalogue, so today the
  // fallback group is where reachability actually lives. This is the
  // regression the incident was: prove the fallback group exists and is
  // non-empty rather than assuming the switch-statement equivalent covers
  // everything.
  const anyFocusAreaSet = catalog.paths.some((path) => path.focusArea);
  if (!anyFocusAreaSet) {
    assert.ok(fallback, "no path declares a focusArea, so the fallback group must exist");
    assert.equal(fallback.paths.length, catalog.paths.length, "every path must be in the fallback group");
  }
});

// The specific six from tonight's incident, kept as a named regression case
// (in addition to the enumeration above, which is what actually guards the
// class of bug) so a reader can see exactly what this incident was about.
test("the six paths authored on 2026-09-11 are reachable", async () => {
  const catalog = await loadCatalog(repoRoot);
  const groups = groupPathsByFocusArea(catalog.paths, defaultFocusAreas);
  const placedIds = new Set(groups.flatMap((group) => group.paths.map((path) => path.id)));

  const namedInIncident = [
    "ai-literacy-and-mental-models",
    "developer-and-practitioner-ai",
    "agentic-systems-and-mcp",
    "rag-and-fine-tuning-engineering",
    "self-hosted-and-aiops",
    "ai-security-and-governance",
  ];
  for (const id of namedInIncident) {
    assert.ok(catalog.paths.some((path) => path.id === id), `sanity: ${id} still exists in the catalogue`);
    assert.ok(placedIds.has(id), `${id} is unreachable from /learn/paths`);
  }
});

// This is the check that would have caught the actual incident: the bug was
// never in a data file, it was a switch statement inside page.tsx that named
// path ids directly. groupPathsByFocusArea() being correct doesn't help a
// learner if a page stops calling it. So: every listing page must both (a)
// delegate to the shared, catalogue-driven grouping function, and (b)
// contain no literal catalogue path id -- because the only reason a page
// that lists paths would ever need to spell one out is to special-case it,
// which is exactly how six paths vanished.
test("listing pages delegate to groupPathsByFocusArea and name no path id directly", async () => {
  const catalog = await loadCatalog(repoRoot);
  const allPathIds = catalog.paths.map((path) => path.id);

  for (const relativePath of LISTING_PAGES) {
    const source = readFileSync(new URL(relativePath, `file://${repoRoot.replace(/\\/g, "/")}`), "utf8");

    assert.match(
      source,
      /groupPathsByFocusArea\s*\(/,
      `${relativePath} must actually call groupPathsByFocusArea(...) -- an unused import doesn't count`,
    );

    const literalIds = allPathIds.filter((id) => source.includes(`"${id}"`) || source.includes(`'${id}'`));
    assert.deepEqual(
      literalIds,
      [],
      `${relativePath} names catalogue path id(s) directly: ${literalIds.join(", ")} -- ` +
        "a listing page that special-cases an id can silently drop any other id the same way",
    );
  }
});

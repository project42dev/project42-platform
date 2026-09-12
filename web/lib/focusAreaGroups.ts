// Grouping learning paths for display on /learn/paths and /ondemand.
//
// A hardcoded id allow-list used to decide
// which paths rendered under which Focus Area. `path.focusArea` has never
// been set on a single path in the catalogue (platform's own bundled
// content, and every adopter's content, alike), so both pages fell back to
// a switch statement that only recognised eight of the fourteen paths in
// the catalogue by id. The other six -- ai-literacy-and-mental-models,
// developer-and-practitioner-ai, agentic-systems-and-mcp,
// rag-and-fine-tuning-engineering, self-hosted-and-aiops, and
// ai-security-and-governance, 22 modules between them -- rendered nothing:
// no card, no link, no way to click to them. Their pages still built (every
// path is in `generateStaticParams`) and they were in the sitemap, so they
// were reachable only to someone who already knew the exact URL.
//
// The fix here is structural rather than a bigger list: every path the
// catalogue contains is placed in exactly one group, always. A path with a
// `focusArea` that names a known Focus Area lands there; everything else --
// no `focusArea` set, or one that names nothing recognised -- lands in a
// single, clearly labelled fallback group instead of nowhere. A future path
// with a typo'd or simply new focusArea id cannot silently vanish the way
// the six did; at worst it displays in the wrong place, which is visible
// and fixable, not invisible.
//
// Note what this does NOT do: it does not invent a focusArea for the six
// (or any) paths. That mapping -- which of the six existing Focus Areas
// each path belongs under -- is curriculum taxonomy that belongs in
// project42-content's catalog.json (`path.focusArea`, plus the matching
// entries in catalog-level `focusAreas`), authored by whoever owns that
// curriculum. Until that field is set, this groups everything under
// "More learning paths" rather than guessing.

export interface FocusAreaDefinition {
  id: string;
  number: number;
  title: string;
  summary: string;
}

export interface PathLike {
  id: string;
  focusArea?: string;
}

export interface FocusAreaGroup<TPath extends PathLike> {
  id: string;
  /** Focus Area ordinal, or null for the fallback group. */
  number: number | null;
  title: string;
  summary: string;
  paths: TPath[];
}

export const FALLBACK_GROUP_ID = "more-learning-paths";

export const FALLBACK_GROUP_TITLE = "More learning paths";

export const FALLBACK_GROUP_SUMMARY =
  "Published and open to everyone. These paths haven't been sorted into a Focus Area yet.";

/**
 * Groups paths by `path.focusArea` against a list of known Focus Area
 * definitions. Every input path appears in exactly one output group's
 * `paths` array: a recognised `focusArea` places it in that group, and
 * anything else -- unset, or naming a Focus Area not in `focusAreas` --
 * places it in the trailing fallback group. Empty groups (no matching
 * paths) are omitted from the result. Order is preserved: Focus Areas in
 * the order given, then the fallback group last.
 */
export function groupPathsByFocusArea<TPath extends PathLike>(
  paths: readonly TPath[],
  focusAreas: readonly FocusAreaDefinition[],
): Array<FocusAreaGroup<TPath>> {
  const groups = new Map<string, FocusAreaGroup<TPath>>();
  for (const area of focusAreas) {
    groups.set(area.id, { id: area.id, number: area.number, title: area.title, summary: area.summary, paths: [] });
  }
  const fallback: FocusAreaGroup<TPath> = {
    id: FALLBACK_GROUP_ID,
    number: null,
    title: FALLBACK_GROUP_TITLE,
    summary: FALLBACK_GROUP_SUMMARY,
    paths: [],
  };

  for (const path of paths) {
    const group = path.focusArea ? groups.get(path.focusArea) : undefined;
    (group ?? fallback).paths.push(path);
  }

  return [...groups.values(), fallback].filter((group) => group.paths.length > 0);
}

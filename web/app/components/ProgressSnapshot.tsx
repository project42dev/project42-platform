"use client";

import Link from "next/link";
import { selectResumeTarget } from "@project42/platform";
import { progressCatalog } from "../../lib/progressCatalog";
import { useProgress } from "./ProgressProvider";

/**
 * THE RESUME AFFORDANCE. One component, rendered on the home page, /learn and
 * the profile dashboard.
 *
 * It existed before this change and was imported by nothing: the only
 * "Continue <title>" control in the codebase rendered on no page in the site.
 * It was kept and repaired rather than replaced, because a second component
 * doing the same job is how two surfaces come to disagree about where a learner
 * left off. Three things were wrong with it:
 *
 * 1. Its empty state rendered a "Ready when you are / Sign in to start" shell.
 *    A first-time visitor does not need a card telling them they have no
 *    progress -- they need the page's own "Begin the first module" CTA, which
 *    is already there. With nothing to resume this now returns null and gets
 *    out of the way. That is what makes item 3 of the brief true: a first visit
 *    shows the normal start CTA, not an empty shell.
 *
 * 2. It linked to `progress.recentModule` directly, so a learner who had just
 *    FINISHED a module was invited to "continue" the one they had completed --
 *    which reads as though the site lost the completion. The rule now lives in
 *    selectResumeTarget (src/progress.ts) where it is unit-tested, and this
 *    component only renders it. That also fixes the stale-module case: a
 *    `recentModule` naming a module this catalogue no longer has returns null
 *    here instead of rendering a link to a 404.
 *
 * 3. The label was "Continue <title>". It is now "Continue: <title>", which is
 *    what the brief asks for and what the browser journey asserts on.
 *
 * `progressCatalog` rather than `lib/catalog`: this is a "use client" module,
 * and tests/surface-isolation.test.mjs holds the line that a client module
 * reads the generated projection so the full 1.3 MB curriculum stays out of the
 * bundle. The projection is generated from the same catalogue the route pages
 * render, so "the module exists" means the same thing here as it does to the
 * route that would otherwise 404.
 */
export function ProgressSnapshot() {
  const { progress, hydrated } = useProgress();

  // Nothing is rendered until the record is known. Rendering a resume card from
  // the empty initial state would flash "start here" at a returning learner and
  // then swap it for their real place.
  if (!hydrated) return null;

  const resume = selectResumeTarget(progress, progressCatalog);
  if (!resume) return null;

  const module = progressCatalog.modules.find(
    (candidate) => candidate.id === resume.moduleId,
  );
  // selectResumeTarget only returns modules this catalogue has, so this is
  // belt-and-braces rather than a live branch -- but rendering "Continue:
  // undefined" would be worse than rendering nothing.
  if (!module) return null;

  const completed = progress.completedModuleIds.length;
  const total = progressCatalog.modules.length;

  return (
    <section className="progress-snapshot shell" aria-label="Resume learning">
      <div>
        <span className="snapshot-kicker">
          {resume.advancedFromCompleted ? "Up next" : "Where you left off"}
        </span>
        <strong>
          {completed} of {total} modules complete
        </strong>
      </div>
      <div
        className="mini-progress"
        role="progressbar"
        aria-label="Total module progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
      >
        <span style={{ width: `${Math.round((completed / total) * 100)}%` }} />
      </div>
      <Link href={`/learn/${resume.pathId}/${resume.moduleId}`}>
        Continue: {module.title} →
      </Link>
    </section>
  );
}

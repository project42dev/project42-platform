import Link from "next/link";

// The forward step at the end of a lesson.
//
// Until this existed, a learner who finished a module had no control that
// moved them on. The knowledge check renders a "next" button, but only after
// the learner passes it, and only on the client -- so the rendered page
// contained no next step at all, and the sole forward affordance was a
// sixteen-entry sidebar in which the learner had to find the module after the
// one they had just read. This is that control, always present, on the server.
//
// It is deliberately a pair. A learner who wants the previous module should
// not have to hunt the rail either, and a two-ended pager is what makes the
// end of a path legible: when there is no next module the forward slot says
// so and returns to the path rather than disappearing, which would leave the
// last module looking identical to a broken one.

export interface LessonPagerTarget {
  href: string;
  title: string;
  /**
   * Set on the on-demand track, where a neighbouring module may not be filmed
   * and therefore opens as the written module instead. Mirrors the rail's
   * existing behaviour so the two never disagree about where a module lives.
   */
  writtenOnly?: boolean;
}

interface LessonPagerProps {
  previous?: LessonPagerTarget;
  next?: LessonPagerTarget;
  pathHref: string;
  pathTitle: string;
}

export function LessonPager({
  previous,
  next,
  pathHref,
  pathTitle,
}: LessonPagerProps) {
  return (
    <nav className="lesson-pager" aria-label="Continue this path">
      {previous ? (
        <Link className="lesson-pager-link lesson-pager-back" href={previous.href}>
          <span className="lesson-pager-direction">← Previous module</span>
          <strong>{previous.title}</strong>
          {previous.writtenOnly ? (
            <em className="lesson-pager-format">Opens as the written module</em>
          ) : null}
        </Link>
      ) : (
        <Link className="lesson-pager-link lesson-pager-back" href={pathHref}>
          <span className="lesson-pager-direction">← Path overview</span>
          <strong>{pathTitle}</strong>
        </Link>
      )}

      {next ? (
        <Link className="lesson-pager-link lesson-pager-forward" href={next.href}>
          <span className="lesson-pager-direction">Next module →</span>
          <strong>{next.title}</strong>
          {next.writtenOnly ? (
            <em className="lesson-pager-format">Opens as the written module</em>
          ) : null}
        </Link>
      ) : (
        <Link className="lesson-pager-link lesson-pager-forward" href={pathHref}>
          <span className="lesson-pager-direction">Last module in this path →</span>
          <strong>Back to {pathTitle}</strong>
        </Link>
      )}
    </nav>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { siteCatalog } from "../../../lib/catalog";
import { orgName } from "../../../lib/copy";
import { groupPathsByFocusArea } from "../../../lib/focusAreaGroups";
import { defaultFocusAreas } from "../../../lib/focusAreas";

export const metadata: Metadata = {
  title: "Learning paths",
  description: `Choose a guided ${orgName} learning path organized by Focus Area.`,
};

interface LearningPathWithFocus {
  id: string;
  title: string;
  summary: string;
  audience: string;
  level: string;
  moduleIds: string[];
  focusArea?: string;
}

export default function LearningPathsPage() {
  const paths = siteCatalog.paths as unknown as LearningPathWithFocus[];
  const groups = groupPathsByFocusArea(paths, defaultFocusAreas);
  // Only count the named Focus Area groups that actually rendered -- a path
  // with no focusArea (every path in the catalogue today) lands in the
  // fallback group instead, so claiming a fixed "6 Focus Areas" here would
  // describe a taxonomy nothing on the page currently shows.
  const namedFocusAreaCount = groups.filter((group) => group.number !== null).length;

  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">Self-paced</p>
        <h1>Learning paths with a clear next step.</h1>
        <p>
          {namedFocusAreaCount > 0
            ? `Start from first principles or jump into practical provider decisions across ${namedFocusAreaCount} Focus Area${namedFocusAreaCount === 1 ? "" : "s"}. Every module ends with a short knowledge check.`
            : "Start from first principles or jump into practical provider decisions. Every module ends with a short knowledge check."}
        </p>
      </header>

      <div className="focus-areas-container">
        {groups.map((area) => {
          const areaPaths = area.paths;

          return (
            <section className="focus-area-group" key={area.id} aria-labelledby={`focus-area-${area.id}`}>
              <div className="focus-area-header">
                <p className="eyebrow">{area.number === null ? "More paths" : `Focus Area ${String(area.number).padStart(2, "0")}`}</p>
                <h2 id={`focus-area-${area.id}`}>{area.title}</h2>
                <p>{area.summary}</p>
              </div>
              <div className="learning-path-list">
                {areaPaths.map((path, positionInArea) => {
                  // Count within the focus area the reader is looking at, not
                  // within the flat catalogue. The number is the most
                  // prominent thing in the row -- 3.5rem italic serif -- and
                  // indexing the global array printed 11 and 13 as the first
                  // two entries of Focus Area 01, which counts nothing the
                  // reader can see. The value was ordinal all along; it was
                  // ordinal in the wrong list.
                  const numberInArea = positionInArea + 1;
                  const modules = path.moduleIds.map((moduleId) => siteCatalog.modules.find((module) => module.id === moduleId)).filter(Boolean);
                  const minutes = modules.reduce((total, module) => total + (module?.estimatedMinutes ?? 0), 0);
                  return (
                    <article className="learning-path-row" key={path.id}>
                      <div className="learning-path-number">{String(numberInArea).padStart(2, "0")}</div>
                      <div>
                        <div className="path-card-top">
                          <span className="level-pill">{path.level}</span>
                          <span>{path.moduleIds.length} modules · {minutes} min</span>
                        </div>
                        <h2>{path.title}</h2>
                        <p>{path.summary}</p>
                        <small>For {path.audience.toLowerCase()}</small>
                      </div>
                      <div className="learning-path-modules" aria-label={`${path.title} modules`}>
                        {modules.map((module, moduleIndex) => <span key={module!.id}>{moduleIndex + 1}. {module!.title}</span>)}
                      </div>
                      <Link className="button button-primary" href={`/learn/${path.id}`}>Explore path</Link>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="learn-format-switch">Would you rather watch it taught? <Link href="/ondemand">See the on-demand classroom →</Link></p>
    </main>
  );
}

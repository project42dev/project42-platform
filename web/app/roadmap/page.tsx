import type { Metadata } from "next";
import roadmap from "../../config/roadmap.json";
import { siteFacts } from "../lib/siteFacts";
import { copy } from "../../lib/copy";

const text = copy.roadmap;

export const metadata: Metadata = {
  title: text.metaTitle,
  description: text.metaDescription,
};

// Grouped by status rather than by date on purpose. Dates on a roadmap read as
// commitments, and the one thing this page must not do is promise a month.
export default function RoadmapPage() {
  const statusLabels: Record<string, string> = text.statusLabels;
  const groups = roadmap.statuses
    .map((status) => ({
      status,
      label: statusLabels[status] ?? status,
      items: roadmap.items.filter((item) => item.status === status),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">{text.eyebrow}</p>
        <h1>{text.heading}</h1>
        <p>
          {text.lede} {roadmap.note}
        </p>
      </header>

      {groups.map((group) => (
        <section
          aria-labelledby={`roadmap-${group.status}`}
          className="roadmap-group"
          key={group.status}
        >
          <div className="roadmap-group-head">
            <h2 id={`roadmap-${group.status}`}>{group.label}</h2>
            <span>
              {group.items.length} item{group.items.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="roadmap-list">
            {group.items.map((item) => (
              <li className={`roadmap-item roadmap-${item.status}`} key={item.id}>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <p className="roadmap-detail">{item.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="page-foot-note">
        {text.footNote}{" "}
        <a href={siteFacts.repositories.roadmap}>{text.footNoteLink}</a>
      </p>
    </main>
  );
}

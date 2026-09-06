import type { Metadata } from "next";
import Link from "next/link";
import { diagramCatalog } from "../lib/diagrams";

export const metadata: Metadata = {
  title: "Visual guides",
  description:
    "Accessible, source-first diagrams for learning, research, prompting, providers, agents, safety, and AI content governance.",
};

export default function DiagramIndexPage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero diagram-index-hero">
        <p className="eyebrow">Visual guides</p>
        <h1>See the system, not just the steps.</h1>
        <p>
          Explore provider-neutral diagrams for learning, research, prompting,
          tool safety, agent workflows, and trustworthy content updates. Every
          visual includes a plain-language explanation and editable Mermaid source.
        </p>
      </header>

      <section aria-labelledby="diagram-library-title">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">Source first · Accessible by design</p>
            <h2 id="diagram-library-title">{diagramCatalog.length} visual guides</h2>
          </div>
          <p className="diagram-library-note">
            Static SVG in the browser. Mermaid source in the repository.
          </p>
        </div>
        <div className="diagram-grid">
          {diagramCatalog.map((diagram, index) => (
            <article className="diagram-card" key={diagram.id}>
              <div className="diagram-card-meta">
                <span>{diagram.category}</span>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="diagram-card-preview">
                {/* Generated SVGs are already optimized static artifacts. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  aria-hidden="true"
                  height="260"
                  loading={index < 2 ? "eager" : "lazy"}
                  src={`/diagrams/${diagram.id}.svg`}
                  width="460"
                />
              </div>
              <h2>{diagram.title}</h2>
              <p>{diagram.summary}</p>
              <Link href={`/guide/diagrams/${diagram.id}`}>Explore this visual →</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

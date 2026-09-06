import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InteractiveDiagramClient } from "../../components/InteractiveDiagramClient";
import { OrchardLifecycleDiagramClient } from "../../components/OrchardLifecycleDiagramClient";
import { diagramCatalog, getDiagram } from "../../lib/diagrams";
import { getDiagramSteps } from "../../lib/diagramSteps";

const REACT_DIAGRAM_IDS = new Set(["orchard-lifecycle"]);

interface DiagramPageProps {
  params: Promise<{ diagramId: string }>;
}

export function generateStaticParams() {
  return diagramCatalog.map((diagram) => ({ diagramId: diagram.id }));
}

export async function generateMetadata({
  params,
}: DiagramPageProps): Promise<Metadata> {
  const { diagramId } = await params;
  const diagram = getDiagram(diagramId);
  return diagram
    ? { title: diagram.title, description: diagram.summary }
    : { title: "Diagram not found" };
}

export default async function DiagramPage({ params }: DiagramPageProps) {
  const { diagramId } = await params;
  const diagram = getDiagram(diagramId);
  if (!diagram) notFound();
  const steps = getDiagramSteps(diagramId);

  return (
    <main className="diagram-detail shell">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/guide/diagrams">Visual guides</Link>
        <span>/</span>
        <span aria-current="page">{diagram.title}</span>
      </nav>

      <header className="diagram-detail-hero">
        <div>
          <p className="eyebrow">{diagram.category} visual guide</p>
          <h1>{diagram.title}</h1>
          <p>{diagram.summary}</p>
        </div>
        <div className="diagram-source-card">
          <span>Editable source</span>
          <strong>Mermaid</strong>
          <a
            href={`/diagrams/${diagram.id}.svg`}
            rel="noreferrer"
            target="_blank"
          >
            Open full-size SVG ↗
          </a>
          <a href={`/diagrams/${diagram.source}`} download>
            Download .mmd source
          </a>
        </div>
      </header>

      <figure className="diagram-figure">
        <div className="diagram-canvas">
          {REACT_DIAGRAM_IDS.has(diagram.id) ? (
            <>
              <span className="visually-hidden">{diagram.altText}</span>
              <OrchardLifecycleDiagramClient alt={diagram.altText} category={diagram.category} steps={steps} title={diagram.title} />
            </>
          ) : (
            <InteractiveDiagramClient alt={diagram.altText} category={diagram.category} height={900} src={`/diagrams/${diagram.id}.svg`} steps={steps} title={diagram.title} width={1440} />
          )}
        </div>
        <figcaption>{diagram.caption}</figcaption>
      </figure>

      <div className="diagram-explanation-grid">
        <section aria-labelledby="diagram-explanation">
          <p className="eyebrow">Read the visual</p>
          <h2 id="diagram-explanation">What this shows</h2>
          <p>{diagram.description}</p>
        </section>
        <section aria-labelledby="diagram-takeaways">
          <p className="eyebrow">Carry this forward</p>
          <h2 id="diagram-takeaways">Key takeaways</h2>
          <ul>
            {diagram.takeaways.map((takeaway) => (
              <li key={takeaway}>{takeaway}</li>
            ))}
          </ul>
        </section>
      </div>

      <nav className="diagram-next" aria-label="More visual guides">
        <Link href="/guide/diagrams">← Browse every visual guide</Link>
      </nav>
    </main>
  );
}

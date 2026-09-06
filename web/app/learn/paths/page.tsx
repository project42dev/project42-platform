import type { Metadata } from "next";
import Link from "next/link";
import { siteCatalog } from "../../../lib/catalog";
import { orgName } from "../../../lib/copy";

export const metadata: Metadata = {
  title: "Learning paths",
  description: `Choose a guided ${orgName} learning path organized by Focus Area.`,
};

interface FocusAreaItem {
  id: string;
  number: number;
  title: string;
  summary: string;
}

interface LearningPathWithFocus {
  id: string;
  title: string;
  summary: string;
  audience: string;
  level: string;
  moduleIds: string[];
  focusArea?: string;
}

const defaultFocusAreas: FocusAreaItem[] = [
  { id: "ai-literacy-and-foundations", number: 1, title: "AI Literacy & Foundations", summary: "Core mental models, language model generation, prompt anatomy, context tokens, verification, and privacy without assuming technical experience." },
  { id: "developer-and-practitioner-ai", number: 2, title: "Developer & Practitioner AI", summary: "Provider-neutral evaluation, capability comparison, structured outputs, function calling, and hands-on practice across Anthropic, OpenAI, and Google Gemini." },
  { id: "frontier-agentic-systems-and-mcp", number: 3, title: "Frontier Agentic Systems & MCP", summary: "Bounded agent loops, tool authority, memory boundaries, Model Context Protocol (MCP) architecture, multi-agent handoffs, and scored capstone." },
  { id: "retrieval-rag-and-fine-tuning", number: 4, title: "Retrieval, RAG & Fine-Tuning", summary: "Advanced retrieval architectures, hybrid search, embedding stores, knowledge graphs, and LoRA/QLoRA fine-tuning." },
  { id: "self-hosted-and-aiops", number: 5, title: "Self-Hosted, Open-Weight & AIOps", summary: "Open-weight model selection, vLLM/Ollama serving, VRAM calculations, artifact integrity, endpoint security, and disaster recovery." },
  { id: "ai-security-and-governance", number: 6, title: "AI Security, Red-Teaming & Governance", summary: "OWASP Top 10 for LLMs, sandboxing, guardrails, compliance frameworks, and cryptographic audit receipts." },
];

export default function LearningPathsPage() {
  const paths = siteCatalog.paths as unknown as LearningPathWithFocus[];

  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">Self-paced</p>
        <h1>Learning paths with a clear next step.</h1>
        <p>Start from first principles or jump into practical provider decisions across 6 Focus Areas. Every module ends with a short knowledge check.</p>
      </header>

      <div className="focus-areas-container">
        {defaultFocusAreas.map((area) => {
          const areaPaths = paths.filter((path) => {
            if (path.focusArea) return path.focusArea === area.id;
            if (area.id === "ai-literacy-and-foundations") return path.id === "ai-foundations" || path.id === "agentic-ai-literacy";
            if (area.id === "developer-and-practitioner-ai") return path.id.includes("practice") || path.id === "providers-in-practice";
            if (area.id === "frontier-agentic-systems-and-mcp") return path.id === "reliable-agent-workflows";
            if (area.id === "self-hosted-and-aiops") return path.id === "self-hosted-model-operations";
            return false;
          });
          if (areaPaths.length === 0) return null;

          return (
            <section className="focus-area-group" key={area.id} aria-labelledby={`focus-area-${area.id}`}>
              <div className="focus-area-header">
                <p className="eyebrow">Focus Area {String(area.number).padStart(2, "0")}</p>
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

import type { Metadata } from "next";
import ContentFreshnessLesson, { type ContentFreshnessLessonContent } from "../../components/ContentFreshnessLesson";
import contentFreshnessJSON from "@project42/platform/content/diagrams/lessons/content-freshness-release.json";
import AgentOrchestrationLesson, { type AgentOrchestrationLessonContent } from "../../components/AgentOrchestrationLesson";
import agentOrchestrationJSON from "@project42/platform/content/diagrams/lessons/agent-orchestration.json";
import CostCapacityLesson, { type Content as CostCapacityLessonContent } from "../../components/CostCapacityLesson";
import costCapacityJSON from "@project42/platform/content/diagrams/lessons/cost-and-capacity-management.json";
import ProviderSelectionLesson, { type ProviderSelectionLessonContent } from "../../components/ProviderSelectionLesson";
import providerSelectionJSON from "@project42/platform/content/diagrams/lessons/provider-selection.json";
import PromptContractLesson, { type PromptContractLessonContent } from "../../components/PromptContractLesson";
import MultiAgentHandoffLesson, { type MultiAgentHandoffLessonContent } from "../../components/MultiAgentHandoffLesson";
import promptContractJSON from "@project42/platform/content/diagrams/lessons/prompt-contract.json";
import multiAgentHandoffJSON from "@project42/platform/content/diagrams/lessons/multi-agent-handoff.json";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GroundedAnswerLesson, type GroundedAnswerLessonContent } from "../../components/GroundedAnswerLesson";
import groundedAnswerLessonJSON from "@project42/platform/content/diagrams/lessons/grounded-answer-workflow.json";
import { LearningEvidenceLesson } from "../../components/LearningEvidenceLesson";
import type { LearningEvidenceLessonContent } from "../../components/LearningEvidenceLesson";
import { SafeAgentLesson } from "../../components/SafeAgentLesson";
import type { SafeAgentLessonContent } from "../../components/SafeAgentLesson";
import { InteractiveDiagramClient } from "../../components/InteractiveDiagramClient";
import OrchardLifecycleLesson, { type OrchardLifecycleLessonContent } from "../../components/OrchardLifecycleLesson";
import orchardLifecycleJSON from "@project42/platform/content/diagrams/lessons/orchard-lifecycle.json";
import learningEvidenceLessonJSON from "@project42/platform/content/diagrams/lessons/learning-evidence-loop.json";
import safeAgentLessonJSON from "@project42/platform/content/diagrams/lessons/safe-agent-loop.json";
import toolTrustLessonJSON from "@project42/platform/content/diagrams/lessons/tool-trust-boundaries.json";
import { diagramCatalog, getDiagram } from "../../lib/diagrams";
import { getDiagramSteps } from "../../lib/diagramSteps";

const LEARNING_EVIDENCE_LOOP_ID = "learning-evidence-loop";

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
  // Rendered at /diagrams/<id> and, via a re-export, at /guide/diagrams/<id>.
  // The /guide/ form is what sitemap.ts publishes and what every link points
  // at, so it is named as canonical from both.
  return diagram
    ? {
        title: diagram.title,
        description: diagram.summary,
        alternates: { canonical: `/guide/diagrams/${diagram.id}/` },
      }
    : { title: "Diagram not found" };
}

export default async function DiagramPage({ params }: DiagramPageProps) {
  const { diagramId } = await params;
  const diagram = getDiagram(diagramId);
  if (!diagram) notFound();

  const isLearningEvidenceLoop = diagramId === LEARNING_EVIDENCE_LOOP_ID;
  const isSafeAgentLoop = diagramId === "safe-agent-loop";
  const isToolTrust = diagramId === "tool-trust-boundaries";
  const isGroundedAnswer = diagramId === "grounded-answer-workflow";
  const groundedAnswerLesson = groundedAnswerLessonJSON as GroundedAnswerLessonContent;
  const isPromptContract = diagramId === "prompt-contract";
  const isMultiAgentHandoff = diagramId === "multi-agent-handoff";
  const promptContract = promptContractJSON as PromptContractLessonContent;
  const multiAgentHandoff = multiAgentHandoffJSON as MultiAgentHandoffLessonContent;
  const isProviderSelection = diagramId === "provider-selection";
  const providerSelection = providerSelectionJSON as ProviderSelectionLessonContent;
  const isCostCapacity = diagramId === "cost-and-capacity-management";
  const costCapacity = costCapacityJSON as CostCapacityLessonContent;
  const isAgentOrchestration = diagramId === "agent-orchestration";
  const agentOrchestration = agentOrchestrationJSON as AgentOrchestrationLessonContent;
  const isContentFreshness = diagramId === "content-freshness-release";
  const contentFreshness = contentFreshnessJSON as ContentFreshnessLessonContent;
  const isOrchardLifecycle = diagramId === "orchard-lifecycle";
  const orchardLifecycle = orchardLifecycleJSON as OrchardLifecycleLessonContent;
  const isNativeLesson = isLearningEvidenceLoop || isSafeAgentLoop || isToolTrust || isGroundedAnswer || isPromptContract || isMultiAgentHandoff || isProviderSelection || isCostCapacity || isAgentOrchestration || isContentFreshness || isOrchardLifecycle;
  const safeAgentLesson = (isToolTrust ? toolTrustLessonJSON : safeAgentLessonJSON) as SafeAgentLessonContent;
  const lesson = learningEvidenceLessonJSON as LearningEvidenceLessonContent;
  const steps = isNativeLesson ? [] : getDiagramSteps(diagramId);
  const position = diagramCatalog.findIndex((entry) => entry.id === diagram.id);
  const previousDiagram = position > 0 ? diagramCatalog[position - 1] : undefined;
  const nextDiagram =
    position >= 0 ? diagramCatalog[position + 1] : undefined;

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
        {isNativeLesson ? (
          <div className="diagram-source-card">
            <span>Interactive lesson</span>
            <a href={`\/diagrams/${diagram.source}`} download>
              Download .mmd source
            </a>
          </div>
        ) : (
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
        )}
      </header>

      <figure className="diagram-figure">
        <div className="diagram-canvas">
          {isNativeLesson && <span className="visually-hidden">{diagram.altText}</span>}
          {isOrchardLifecycle ? (
            <OrchardLifecycleLesson data={orchardLifecycle} />
          ) : isContentFreshness ? (
            <ContentFreshnessLesson data={contentFreshness} />
          ) : isAgentOrchestration ? (
            <AgentOrchestrationLesson data={agentOrchestration} />
          ) : isCostCapacity ? (
            <CostCapacityLesson data={costCapacity} />
          ) : isProviderSelection ? (
            <ProviderSelectionLesson data={providerSelection} />
          ) : isPromptContract ? (
            <PromptContractLesson data={promptContract} />
          ) : isMultiAgentHandoff ? (
            <MultiAgentHandoffLesson data={multiAgentHandoff} />
          ) : isGroundedAnswer ? (
            <><span className="visually-hidden">{groundedAnswerLesson.altText}</span><GroundedAnswerLesson data={groundedAnswerLesson} /></>
          ) : isSafeAgentLoop || isToolTrust ? (
            <><span className="visually-hidden">{safeAgentLesson.altText}</span><SafeAgentLesson data={safeAgentLesson} /></>
          ) : isLearningEvidenceLoop ? (
            <><span className="visually-hidden">{diagram.altText}</span><LearningEvidenceLesson data={lesson} /></>
          ) : (
            <InteractiveDiagramClient
              alt={diagram.altText}
              category={diagram.category}
              height={900}
              src={`/diagrams/${diagram.id}.svg`}
              steps={steps}
              title={diagram.title}
              width={1440}
            />
          )}
        </div>
        <figcaption>{diagram.caption}</figcaption>
      </figure>

      {(
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
      )}

      <nav className="diagram-next" aria-label="Nearby visual guides">
        {previousDiagram ? (
          <Link href={`/guide/diagrams/${previousDiagram.id}`}>
            ← {previousDiagram.title}
          </Link>
        ) : (
          <Link href="/guide/diagrams">← Browse every visual guide</Link>
        )}
        <Link className="diagram-next-index" href="/guide/diagrams">
          All {diagramCatalog.length} visual guides
        </Link>
        {nextDiagram ? (
          <Link href={`/guide/diagrams/${nextDiagram.id}`}>
            {nextDiagram.title} →
          </Link>
        ) : (
          <Link href="/guide" prefetch={false}>
            Back to the Field Guide →
          </Link>
        )}
      </nav>
    </main>
  );
}

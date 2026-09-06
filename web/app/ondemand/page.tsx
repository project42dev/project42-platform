import type { Metadata } from "next";
import Link from "next/link";
import {
  getClassScriptPackage,
} from "@project42/platform";
import { getLearningModule, siteCatalog } from "../../lib/catalog";
import { getInstructorRendering, instructorRenderings } from "../lib/instructorMedia";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: "On-demand classroom",
  description:
    `Instructor-led lessons on demand: the same ${orgName} modules organized by Focus Area, taught on video with captions and a full transcript.`,
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

interface OnDemandLesson {
  moduleId: string;
  title: string;
  seconds: number;
  scripted: boolean;
  rendering?: unknown;
}

interface OnDemandPathEntry {
  path: LearningPathWithFocus;
  lessons: OnDemandLesson[];
  scriptedCount: number;
  minutes: number;
  filmed?: OnDemandLesson;
}

const defaultFocusAreas: FocusAreaItem[] = [
  {
    id: "ai-literacy-and-foundations",
    number: 1,
    title: "AI Literacy & Foundations",
    summary: "Core mental models, language model generation, prompt anatomy, context tokens, verification, and privacy without assuming technical experience.",
  },
  {
    id: "developer-and-practitioner-ai",
    number: 2,
    title: "Developer & Practitioner AI",
    summary: "Provider-neutral evaluation, capability comparison, structured outputs, function calling, and hands-on practice across Anthropic, OpenAI, and Google Gemini.",
  },
  {
    id: "frontier-agentic-systems-and-mcp",
    number: 3,
    title: "Frontier Agentic Systems & MCP",
    summary: "Bounded agent loops, tool authority, memory boundaries, Model Context Protocol (MCP) architecture, multi-agent handoffs, and scored capstone.",
  },
  {
    id: "retrieval-rag-and-fine-tuning",
    number: 4,
    title: "Retrieval, RAG & Fine-Tuning",
    summary: "Advanced retrieval architectures, hybrid search, embedding stores, knowledge graphs, and LoRA/QLoRA fine-tuning.",
  },
  {
    id: "self-hosted-and-aiops",
    number: 5,
    title: "Self-Hosted, Open-Weight & AIOps",
    summary: "Open-weight model selection, vLLM/Ollama serving, VRAM calculations, artifact integrity, endpoint security, and disaster recovery.",
  },
  {
    id: "ai-security-and-governance",
    number: 6,
    title: "AI Security, Red-Teaming & Governance",
    summary: "OWASP Top 10 for LLMs, sandboxing, guardrails, compliance frameworks, and cryptographic audit receipts.",
  },
];

export default function OnDemandPage() {
  const focusAreas = defaultFocusAreas;
  const rawPaths = siteCatalog.paths as unknown as LearningPathWithFocus[];

  const paths: OnDemandPathEntry[] = rawPaths.map((path) => {
    const lessons: OnDemandLesson[] = path.moduleIds.flatMap((moduleId) => {
      const classScript = getClassScriptPackage(moduleId);
      const lessonModule = getLearningModule(moduleId);
      if (!lessonModule) return [];
      return [
        {
          moduleId,
          title: lessonModule.title,
          seconds: classScript?.plannedDurationSeconds ?? 0,
          scripted: Boolean(classScript),
          rendering: getInstructorRendering(moduleId),
        },
      ];
    });
    const scripted = lessons.filter((lesson) => lesson.scripted);
    return {
      path,
      lessons,
      scriptedCount: scripted.length,
      minutes: Math.round(
        scripted.reduce((total, lesson) => total + lesson.seconds, 0) / 60,
      ),
      filmed: lessons.find((lesson) => lesson.rendering),
    };
  });

  const scriptedTotal = paths.reduce((total, entry) => total + entry.scriptedCount, 0);
  const pathsWithScripts = paths.filter((entry) => entry.scriptedCount > 0).length;
  const filmedCount = instructorRenderings.length;

  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">
          Instructor-led <span className="level-pill">Preview</span>
        </p>
        <h1>The classroom, on demand.</h1>
        <p>
          The same material, taught rather than read. A virtual instructor works
          through each module on video, with captions and a full transcript, so you
          can watch a lesson instead of reading one. Same Focus Areas, same courses,
          same knowledge checks, same sources, and one record either way.
        </p>
      </header>

      <p className="ondemand-status">
        <strong>
          {filmedCount} lesson{filmedCount === 1 ? "" : "s"} filmed so far
        </strong>{" "}
        out of {scriptedTotal} written for the classroom, across{" "}
        {pathsWithScripts} of {siteCatalog.paths.length} paths. The Focus Areas and
        their courses are identical to the self-paced curriculum. Every module is already
        available to read, and anything you finish now carries straight over when
        its lesson is published.
      </p>

      <div className="focus-areas-container">
        {focusAreas.map((area: FocusAreaItem) => {
          const areaEntries = paths.filter(({ path }: OnDemandPathEntry) => {
            if (path.focusArea) return path.focusArea === area.id;
            if (area.id === "ai-literacy-and-foundations") return path.id === "ai-foundations" || path.id === "agentic-ai-literacy";
            if (area.id === "developer-and-practitioner-ai") return path.id.includes("practice") || path.id === "providers-in-practice";
            if (area.id === "frontier-agentic-systems-and-mcp") return path.id === "reliable-agent-workflows";
            if (area.id === "self-hosted-and-aiops") return path.id === "self-hosted-model-operations";
            return false;
          });

          if (areaEntries.length === 0) return null;

          return (
            <section className="focus-area-group" key={area.id} aria-labelledby={`focus-area-ondemand-${area.id}`}>
              <div className="focus-area-header">
                <p className="eyebrow">Focus Area {String(area.number).padStart(2, "0")}</p>
                <h2 id={`focus-area-ondemand-${area.id}`}>{area.title}</h2>
                <p>{area.summary}</p>
              </div>

              <div className="learning-path-list">
                {areaEntries.map(({ path, lessons, scriptedCount, minutes, filmed }) => {
                  const currentCourseNumber = paths.findIndex((e) => e.path.id === path.id) + 1;

                  return (
                    <article
                      className={
                        scriptedCount > 0 ? "learning-path-row" : "learning-path-row is-unwritten"
                      }
                      key={path.id}
                    >
                      <div className="learning-path-number">{String(currentCourseNumber).padStart(2, "0")}</div>
                      <div>
                        <div className="path-card-top">
                          <span className="level-pill">{path.level}</span>
                          <span>
                            {scriptedCount > 0
                              ? `${scriptedCount} scripted · ~${minutes} min`
                              : "Not scripted yet"}
                          </span>
                        </div>
                        <h2>{path.title}</h2>
                        <p>{path.summary}</p>
                        <small>For {path.audience.toLowerCase()}</small>
                      </div>
                      <div className="ondemand-lessons" aria-label={`${path.title} lessons`}>
                        {lessons.map((lesson, lessonIndex) => (
                          <div className="ondemand-lesson-item" key={lesson.moduleId}>
                            <span className="ondemand-lesson-title">
                              {lessonIndex + 1}. {lesson.title}
                            </span>
                            {lesson.rendering ? (
                              <Link
                                className="ondemand-pill is-filmed"
                                href={`/ondemand/${path.id}/${lesson.moduleId}`}
                              >
                                Watch lesson →
                              </Link>
                            ) : lesson.scripted ? (
                              <span className="ondemand-pill is-scripted">
                                Scripted · filming soon
                              </span>
                            ) : (
                              <Link
                                className="ondemand-pill is-read-only"
                                href={`/learn/${path.id}/${lesson.moduleId}`}
                              >
                                Read module →
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                      {filmed ? (
                        <Link
                          className="button button-primary"
                          href={`/ondemand/${path.id}/${filmed.moduleId}`}
                        >
                          Watch published lesson
                        </Link>
                      ) : (
                        <Link className="button button-secondary" href={`/learn/${path.id}`}>
                          Read path online
                        </Link>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="learn-format-switch" style={{ marginTop: "2rem" }}>
        Prefer reading the text-first modules?{" "}
        <Link href="/learn/paths">Explore the self-paced library →</Link>
      </p>
    </main>
  );
}

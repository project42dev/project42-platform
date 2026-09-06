import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getLearningModule,
  getLearningPath,
  starterCatalog,
} from "@project42/platform";
import { CapstoneSubmission } from "../../../components/CapstoneSubmission";
import { KnowledgeCheck } from "../../../components/KnowledgeCheck";
import { LearningActivity } from "../../../components/LearningActivity";
import { LessonSections } from "../../../components/LessonSections";
import { ModuleVisitTracker } from "../../../components/ModuleVisitTracker";
import { ProviderComparisonMatrix } from "../../../components/ProviderComparisonMatrix";
import { ProviderPills } from "../../../components/ProviderPills";
import { retiredLearningPaths, retiredPathTarget } from "../../../lib/retiredPaths";

interface ModulePageProps {
  params: Promise<{ pathId: string; moduleId: string }>;
}

export function generateStaticParams() {
  return [
    ...starterCatalog.paths.flatMap((path) =>
      path.moduleIds.map((moduleId) => ({ pathId: path.id, moduleId })),
    ),
    ...retiredLearningPaths.flatMap((entry) =>
      entry.retiredModuleIds.map((moduleId) => ({
        pathId: entry.pathId,
        moduleId,
      })),
    ),
  ];
}

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const { moduleId } = await params;
  const lessonModule = getLearningModule(moduleId);
  return lessonModule
    ? { title: lessonModule.title, description: lessonModule.summary }
    : { title: "Module not found" };
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { pathId, moduleId } = await params;
  const path = getLearningPath(pathId);
  const lessonModule = getLearningModule(moduleId);
  if (!path || !lessonModule || !path.moduleIds.includes(lessonModule.id)) {
    // A module URL under a retired path is a previously published URL too, so
    // it follows its path rather than dying with it.
    const target = retiredPathTarget(pathId, moduleId);
    if (target) permanentRedirect(target);
    notFound();
  }
  const position = path.moduleIds.indexOf(lessonModule.id);
  const nextModuleId = path.moduleIds[position + 1];
  const nextHref = nextModuleId ? `/learn/${path.id}/${nextModuleId}` : undefined;
  const prerequisites = lessonModule.prerequisites.flatMap((prerequisiteId) => {
    const prerequisite = getLearningModule(prerequisiteId);
    const prerequisitePath = starterCatalog.paths.find((candidate) =>
      candidate.moduleIds.includes(prerequisiteId),
    );
    return prerequisite && prerequisitePath
      ? [
          {
            href: `/learn/${prerequisitePath.id}/${prerequisite.id}`,
            title: prerequisite.title,
          },
        ]
      : [];
  });

  return (
    <main className="lesson-page shell">
      <ModuleVisitTracker moduleId={lessonModule.id} pathId={path.id} />
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/learn/paths">Learning paths</Link>
        <span>/</span>
        <Link href={`/learn/${path.id}`}>{path.title}</Link>
        <span>/</span>
        <span aria-current="page">{lessonModule.title}</span>
      </nav>

      <div className="lesson-layout">
        <article className="lesson-main">
          <header className="lesson-hero">
            <div className="lesson-kicker">
              Module {position + 1} of {path.moduleIds.length} ·{" "}
              {lessonModule.estimatedMinutes} min
            </div>
            <h1>{lessonModule.title}</h1>
            <p>{lessonModule.summary}</p>
            <ProviderPills providers={lessonModule.providers} />
          </header>

          {prerequisites.length > 0 ? (
            <aside className="prerequisite-note" aria-labelledby="prerequisite-title">
              <p className="eyebrow">Recommended first</p>
              <h2 id="prerequisite-title">Build on the earlier lesson</h2>
              <ul>
                {prerequisites.map((prerequisite) => (
                  <li key={prerequisite.href}>
                    <Link href={prerequisite.href}>{prerequisite.title}</Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          <section className="objectives" aria-labelledby="objectives-title">
            <p className="eyebrow">By the end</p>
            <h2 id="objectives-title">You will be able to</h2>
            <ul>
              {lessonModule.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </section>

          <LessonSections sections={lessonModule.sections} />

          {lessonModule.comparisonMatrix ? (
            <ProviderComparisonMatrix
              matrix={lessonModule.comparisonMatrix}
              sources={lessonModule.sources}
            />
          ) : null}

          {lessonModule.activity ? (
            <LearningActivity activity={lessonModule.activity} />
          ) : null}

          {lessonModule.capstone ? (
            <CapstoneSubmission
              capstone={lessonModule.capstone}
              moduleId={lessonModule.id}
              pathId={path.id}
            />
          ) : null}

          <section className="sources" aria-labelledby="sources-title">
            <p className="eyebrow">Evidence</p>
            <h2 id="sources-title">Sources and verification</h2>
            <ul>
              {lessonModule.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} rel="noreferrer" target="_blank">
                    {source.title}
                  </a>
                  <span>
                    {source.publisher} · verified {source.lastVerified}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <KnowledgeCheck
            key={lessonModule.id}
            moduleId={lessonModule.id}
            nextHref={nextHref}
            passPercent={lessonModule.knowledgeCheck.passPercent}
            pathId={path.id}
            questions={lessonModule.knowledgeCheck.questions}
            requiresCapstone={Boolean(lessonModule.capstone)}
          />
        </article>

        <aside className="lesson-rail" aria-label="Module navigation">
          <div>
            <small>{path.title}</small>
            <strong>
              {position + 1}/{path.moduleIds.length}
            </strong>
          </div>
          <ol>
            {path.moduleIds.map((id, index) => {
              const item = getLearningModule(id);
              return (
                <li className={id === lessonModule.id ? "current" : ""} key={id}>
                  <Link href={`/learn/${path.id}/${id}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item?.title}
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </main>
  );
}

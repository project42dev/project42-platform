import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClassScriptPackage,
  getLearningModule,
  getLearningPath,
} from "@project42/platform";
import { KnowledgeCheck } from "../../../components/KnowledgeCheck";
import { ModuleVisitTracker } from "../../../components/ModuleVisitTracker";
import { ProviderPills } from "../../../components/ProviderPills";
import {
  SEGMENT_KIND_LABELS,
  formatLessonLength,
  formatSegmentLength,
  getInstructorRendering,
  instructorRenderings,
} from "../../../lib/instructorMedia";

interface LessonPageProps {
  params: Promise<{ pathId: string; moduleId: string }>;
}

// Only lessons that have actually been rendered get a page. The alternative -
// a route for all forty modules carrying a class script - would publish
// thirty-nine pages whose only content is an apology, and would tell a search
// engine we have a video library we do not have.
export function generateStaticParams() {
  return instructorRenderings.map((rendering) => ({
    pathId: rendering.pathId,
    moduleId: rendering.moduleId,
  }));
}

export async function generateMetadata({
  params,
}: LessonPageProps): Promise<Metadata> {
  const { moduleId } = await params;
  const lessonModule = getLearningModule(moduleId);
  return lessonModule
    ? {
        title: `${lessonModule.title} (on demand)`,
        description: lessonModule.summary,
      }
    : { title: "Lesson not found" };
}

export default async function OnDemandLessonPage({ params }: LessonPageProps) {
  const { pathId, moduleId } = await params;
  const path = getLearningPath(pathId);
  const lessonModule = getLearningModule(moduleId);
  const classScript = getClassScriptPackage(moduleId);
  const rendering = getInstructorRendering(moduleId);
  if (
    !path ||
    !lessonModule ||
    !classScript ||
    !rendering ||
    !path.moduleIds.includes(lessonModule.id)
  ) {
    notFound();
  }

  const position = path.moduleIds.indexOf(lessonModule.id);
  const nextModuleId = path.moduleIds[position + 1];
  // The next step stays inside the format the learner chose when a lesson
  // exists there, and falls back to the written module when it does not. It
  // never dead-ends: there is always a next module, only sometimes a next film.
  const nextHref = nextModuleId
    ? getInstructorRendering(nextModuleId)
      ? `/ondemand/${path.id}/${nextModuleId}`
      : `/learn/${path.id}/${nextModuleId}`
    : undefined;

  const spokenSegments = classScript.segments.filter(
    (segment) => segment.delivery === "spoken",
  );

  return (
    <main className="lesson-page shell">
      {/*
        The same tracker the written module uses, with the same module and path
        ids. That is the whole of ADR-0020 in one line: instructor-led is a
        second rendering of one module, so finishing it here has to land in the
        learner's record identically. There is no "format" field anywhere in
        the learning event contract, and there should not be one.
      */}
      <ModuleVisitTracker moduleId={lessonModule.id} pathId={path.id} />

      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/ondemand">On demand</Link>
        <span>/</span>
        <Link href={`/learn/${path.id}`}>{path.title}</Link>
        <span>/</span>
        <span aria-current="page">{lessonModule.title}</span>
      </nav>

      <div className="lesson-layout">
        <article className="lesson-main">
          <header className="lesson-hero">
            <div className="lesson-kicker">
              Instructor-led · Lesson {position + 1} of {path.moduleIds.length} ·{" "}
              {formatLessonLength(classScript.plannedDurationSeconds)}
            </div>
            <h1>{lessonModule.title}</h1>
            <p>{lessonModule.summary}</p>
            <ProviderPills providers={lessonModule.providers} />
          </header>

          <section className="lesson-video" aria-labelledby="lesson-video-title">
            <p className="eyebrow">Instructor-led</p>
            <h2 id="lesson-video-title">Watch the class</h2>
            <video
              className="lesson-preview-video"
              controls
              preload="metadata"
              playsInline
              aria-label={`${lessonModule.title}, taught by a virtual instructor`}
            >
              <source src={rendering.src} type="video/mp4" />
              This browser cannot play the lesson. The full script is written out
              below, and the{" "}
              <a href={`/learn/${path.id}/${lessonModule.id}`}>written module</a>{" "}
              covers the same material.
            </video>
            {rendering.partial ? (
              <p className="lesson-video-note">
                <strong>Partial render.</strong> {rendering.renderedSeconds} seconds
                covering the first {rendering.renderedSegments} of{" "}
                {classScript.segments.length} segments. The rest of the class is
                written out below and is complete in{" "}
                <Link href={`/learn/${path.id}/${lessonModule.id}`}>
                  the written module
                </Link>
                .
              </p>
            ) : null}
            {/* The disclosure travels with the rendering rather than being page
                copy, so a learner is told the instructor is synthetic wherever
                the lesson is served and the curriculum's own validator can
                require it. */}
            <p className="lesson-video-note">{rendering.disclosure}</p>
            <p className="lesson-video-meta">
              Captions {rendering.captions === "embedded" ? "embedded" : "provided"}{" "}
              · presenter {rendering.avatar} · voice {rendering.voice} · rendered{" "}
              {rendering.renderedAt}. Produced and reviewed before publication, then
              served as a fixed package. Nothing is generated while you watch.
            </p>
          </section>

          <section className="objectives" aria-labelledby="objectives-title">
            <p className="eyebrow">By the end</p>
            <h2 id="objectives-title">You will be able to</h2>
            <ul>
              {classScript.learningObjectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </section>

          {/*
            The script and the transcript are the same artifact, so they are one
            list rather than two. accessibility.transcriptRequired is true for
            every class script, and a transcript that repeated the outline
            underneath it would be a second copy to keep in step.
          */}
          <section className="class-outline" aria-labelledby="outline-title">
            <p className="eyebrow">
              {classScript.segments.length} segments ·{" "}
              {classScript.spokenWordCount.toLocaleString("en-US")} spoken words
            </p>
            <h2 id="outline-title">How the class runs, and every word of it</h2>
            <p className="class-outline-lede">
              The full transcript, in order. Search it, copy it, or read it instead
              of watching. {spokenSegments.length} of the{" "}
              {classScript.segments.length} segments are spoken aloud; the rest are
              pauses and on-screen work.
            </p>
            <ol className="class-segments">
              {classScript.segments.map((segment, index) => {
                const covered = index < rendering.renderedSegments;
                return (
                  <li
                    className={covered ? "class-segment is-filmed" : "class-segment"}
                    key={segment.id}
                  >
                    <div className="class-segment-head">
                      <span className="class-segment-kind">
                        {SEGMENT_KIND_LABELS[segment.kind] ?? segment.kind}
                      </span>
                      <span className="class-segment-length">
                        {formatSegmentLength(segment.estimatedSeconds)}
                      </span>
                      {covered ? (
                        <span className="class-segment-filmed">In the video</span>
                      ) : null}
                    </div>
                    {segment.spokenText ? (
                      <p className="class-segment-speech">{segment.spokenText}</p>
                    ) : null}
                    {segment.visual ? (
                      <p className="class-segment-visual">
                        <strong>On screen:</strong> {segment.visual.altText}
                      </p>
                    ) : null}
                    {segment.expectedLearnerAction ? (
                      <p className="class-segment-action">
                        <strong>Your turn:</strong> {segment.expectedLearnerAction}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>

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

          {/*
            The same component, the same questions, the same pass mark as the
            written module. A separate assessment for the video would be a
            second thing to keep correct and would let the two disagree.
          */}
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
              const filmed = getInstructorRendering(id);
              return (
                <li className={id === lessonModule.id ? "current" : ""} key={id}>
                  <Link
                    href={
                      filmed
                        ? `/ondemand/${path.id}/${id}`
                        : `/learn/${path.id}/${id}`
                    }
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item?.title}
                    {filmed ? null : <em className="rail-format">read</em>}
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="rail-note">
            Lessons without a film open as the written module. Your progress is the
            same either way.
          </p>
        </aside>
      </div>
    </main>
  );
}

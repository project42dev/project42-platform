"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./MultiAgentHandoffLesson.module.css";

type Visibility = { kind: "always" } | { kind: "afterAttempt"; groupId: string };
type Field = { label: string; value: string };
type Participant = { id: string; shortLabel: string; label: string; description: string };
type Phase = { id: string; kind: "sequence" | "optional" | "bypass" | "join"; label: string; description: string; messageIds: string[] };
type Message = { id: string; ordinal: number; from: string; to: string; line: "solid" | "dashed"; label: string; heading: string; description: string; artifactIds: string[] };
type Artifact = { id: string; label: string; title: string; body: string; visibility: Visibility; fields?: Field[] };
type Choice = { id: string; groupId: string; label: string; correct: boolean; announcement: string; feedback: string };
type PracticeGroup = { id: string; title: string; prompt: string; dossierArtifactId: string; solutionArtifactId: string; choiceIds: string[]; retryAnnouncement: string };
type Source = { title: string; publisher: string; url: string; use: string };

export interface MultiAgentHandoffLessonContent {
  schemaVersion: number;
  id: string;
  canonicalPath: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  fixtureNotice: string;
  roleBoundaryNote: string;
  diagramLabel: string;
  textAlternativeLabel: string;
  walkthroughHeading: string;
  practiceHeading: string;
  practiceInstructions: string;
  feedbackLabel: string;
  retryLabel: string;
  resetLabel: string;
  pendingCompletion: string;
  earnedCompletion: string;
  resetAnnouncement: string;
  participants: Participant[];
  phases: Phase[];
  messages: Message[];
  artifacts: Artifact[];
  practiceGroups: PracticeGroup[];
  choices: Choice[];
  takeaways: string[];
  sourcesHeading: string;
  sourcesIntroduction: string;
  sources: Source[];
}

export interface MultiAgentHandoffLessonProps {
  data: MultiAgentHandoffLessonContent;
}

function validate(data: MultiAgentHandoffLessonContent): void {
  const unique = (ids: string[], name: string) => {
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${name} id`);
  };
  if (data.id !== "multi-agent-handoff") throw new Error("Unexpected lesson id");
  if (data.participants.map((p) => p.id).join(",") !== "H,O,W,R") throw new Error("Participant order must be H,O,W,R");
  if (data.messages.length !== 10 || data.messages.some((m, i) => m.ordinal !== i + 1)) throw new Error("Messages must be m1 through m10 in ordinal order");
  const expected = ["H>O:solid", "O>W:solid", "W>O:dashed", "O>R:solid", "R>O:dashed", "O>W:solid", "W>O:dashed", "O>R:solid", "R>O:dashed", "O>H:dashed"];
  const actual = data.messages.map((m) => `${m.from}>${m.to}:${m.line}`);
  if (actual.some((value, index) => value !== expected[index])) throw new Error("Original message directions or line semantics changed");
  unique(data.participants.map((x) => x.id), "participant");
  unique(data.phases.map((x) => x.id), "phase");
  unique(data.messages.map((x) => x.id), "message");
  unique(data.artifacts.map((x) => x.id), "artifact");
  unique(data.practiceGroups.map((x) => x.id), "practice group");
  unique(data.choices.map((x) => x.id), "choice");
  const participantIds = new Set(data.participants.map((x) => x.id));
  const messageIds = new Set(data.messages.map((x) => x.id));
  const artifactIds = new Set(data.artifacts.map((x) => x.id));
  const groupIds = new Set(data.practiceGroups.map((x) => x.id));
  const choiceIds = new Set(data.choices.map((x) => x.id));
  data.messages.forEach((m) => {
    if (!participantIds.has(m.from) || !participantIds.has(m.to)) throw new Error(`Unknown participant in ${m.id}`);
    m.artifactIds.forEach((id) => { if (!artifactIds.has(id)) throw new Error(`Unknown artifact ${id}`); });
  });
  data.phases.forEach((phase) => phase.messageIds.forEach((id) => { if (!messageIds.has(id)) throw new Error(`Unknown message ${id}`); }));
  data.practiceGroups.forEach((group) => {
    if (!artifactIds.has(group.dossierArtifactId) || !artifactIds.has(group.solutionArtifactId)) throw new Error(`Unknown practice artifact in ${group.id}`);
    if (group.choiceIds.filter((id) => data.choices.find((c) => c.id === id)?.correct).length !== 1) throw new Error(`Practice ${group.id} must have one correct choice`);
    group.choiceIds.forEach((id) => { if (!choiceIds.has(id)) throw new Error(`Unknown choice ${id}`); });
  });
  data.choices.forEach((choice) => { if (!groupIds.has(choice.groupId)) throw new Error(`Unknown group in ${choice.id}`); });
}

function ArtifactView({ artifact }: { artifact: Artifact }) {
  return <section className={styles.artifact} data-artifact-id={artifact.id}>
    <p className={styles.eyebrow}>{artifact.label}</p>
    <h4>{artifact.title}</h4>
    {artifact.body.split("\n").map((line, index) => <p key={`${artifact.id}-${index}`}>{line}</p>)}
    {artifact.fields && <dl>{artifact.fields.map((field, index) => <div key={`${artifact.id}-field-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}
  </section>;
}

export default function MultiAgentHandoffLesson({ data }: MultiAgentHandoffLessonProps) {
  useMemo(() => validate(data), [data]);
  const rawId = useId().replace(/:/g, "");
  const titleId = `${rawId}-title`;
  const detailId = `${rawId}-detail`;
  const markerId = `${rawId}-arrow`;
  const plotRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const practiceRefs = useRef(new Map<string, HTMLElement>());
  const [plotWidth, setPlotWidth] = useState(0);
  const [selectedId, setSelectedId] = useState(data.messages[0]?.id ?? "");
  const [attempted, setAttempted] = useState<Record<string, boolean>>({});
  const [correct, setCorrect] = useState<Record<string, boolean>>({});
  const [latest, setLatest] = useState<Record<string, string>>({});
  const [attemptCount, setAttemptCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const update = () => setPlotWidth(Math.max(1, Math.round(node.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const participants = useMemo(() => new Map(data.participants.map((item, index) => [item.id, { item, index }])), [data.participants]);
  const messages = useMemo(() => new Map(data.messages.map((item) => [item.id, item])), [data.messages]);
  const artifacts = useMemo(() => new Map(data.artifacts.map((item) => [item.id, item])), [data.artifacts]);
  const choices = useMemo(() => new Map(data.choices.map((item) => [item.id, item])), [data.choices]);
  const selected = messages.get(selectedId) ?? data.messages[0];
  const complete = data.practiceGroups.every((group) => correct[group.id]);
  const laneX = (participantId: string) => ((participants.get(participantId)?.index ?? 0) + 0.5) * plotWidth / 4;
  const visible = (artifact?: Artifact): artifact is Artifact => Boolean(artifact && (artifact.visibility.kind === "always" || attempted[artifact.visibility.groupId]));

  const selectMessage = (message: Message) => {
    setSelectedId(message.id);
    setAnnouncement(`${message.ordinal}. ${message.label}. ${message.heading}`);
    requestAnimationFrame(() => detailRef.current?.focus());
  };

  const submit = (choice: Choice) => {
    setAttemptCount((count) => count + 1);
    setAttempted((state) => ({ ...state, [choice.groupId]: true }));
    setCorrect((state) => ({ ...state, [choice.groupId]: state[choice.groupId] || choice.correct }));
    setLatest((state) => ({ ...state, [choice.groupId]: choice.id }));
    setAnnouncement(choice.announcement);
  };

  const retry = (group: PracticeGroup) => {
    setLatest((state) => { const next = { ...state }; delete next[group.id]; return next; });
    setAnnouncement(group.retryAnnouncement);
    practiceRefs.current.get(group.id)?.focus();
  };

  const reset = () => {
    setSelectedId(data.messages[0]?.id ?? "");
    setAttempted({});
    setCorrect({});
    setLatest({});
    setAttemptCount(0);
    setAnnouncement(data.resetAnnouncement);
  };

  return <section className={styles.lesson} aria-labelledby={titleId}>
    <p className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</p>
    <header className={styles.header}>
      <p className={styles.eyebrow}>{data.category}</p>
      <h2 id={titleId}>{data.title}</h2>
      <p>{data.summary}</p><p>{data.description}</p>
      <p className={styles.notice}>{data.fixtureNotice}</p>
      <p className={styles.notice}>{data.roleBoundaryNote}</p>
    </header>

    <section className={styles.status} aria-label="Practice status">
      <span><strong>Attempts:</strong> {attemptCount}</span>
      <span><strong>Completion:</strong> {complete ? data.earnedCompletion : data.pendingCompletion}</span>
    </section>

    <div className={styles.diagram} role="group" aria-label={data.diagramLabel}>
      <div className={styles.plot} ref={plotRef} data-sequence-plot>
        <div className={styles.participants} data-participant-row>
          {data.participants.map((participant) => <div className={styles.participant} data-participant-id={participant.id} key={participant.id} title={participant.description}><strong>{participant.shortLabel}</strong><span>{participant.label}</span></div>)}
        </div>
        <div className={styles.lifelines} aria-hidden="true">
          {data.participants.map((participant, index) => <span key={participant.id} style={{ left: `${(index + 0.5) * 25}%` }} />)}
        </div>
        <div className={styles.phases}>
          {data.phases.map((phase) => <section className={`${styles.phase} ${styles[phase.kind]}`} data-phase-id={phase.id} key={phase.id}>
            <header className={styles.phaseHeader}><strong>{phase.label}</strong><span>{phase.description}</span></header>
            {phase.messageIds.map((id) => {
              const message = messages.get(id);
              if (!message) return null;
              const from = participants.get(message.from)?.item.label;
              const to = participants.get(message.to)?.item.label;
              const x1 = laneX(message.from);
              const x2 = laneX(message.to);
              const markerGap = x2 >= x1 ? 1 : -1;
              return <button className={styles.message} data-message-id={message.id} aria-pressed={selected?.id === message.id} aria-label={`${message.ordinal}. ${from} to ${to}: ${message.label}`} key={message.id} onClick={() => selectMessage(message)} type="button">
                <span className={styles.messageLabel}>{message.ordinal}. {message.label}</span>
                {plotWidth > 0 && <svg className={styles.arrow} aria-hidden="true" width={plotWidth} height="32" viewBox={`0 0 ${plotWidth} 32`} preserveAspectRatio="xMidYMid meet">
                  <defs><marker id={`${markerId}-${message.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path className={styles.marker} d="M0 0 L8 4 L0 8 Z" /></marker></defs>
                  <line className={message.line === "dashed" ? styles.dashed : styles.solid} x1={x1} x2={x2 - markerGap} y1="16" y2="16" markerEnd={`url(#${markerId}-${message.id})`} />
                </svg>}
              </button>;
            })}
          </section>)}
        </div>
      </div>
    </div>

    <details className={styles.textAlternative}>
      <summary>{data.textAlternativeLabel}</summary>
      <ol>{data.messages.map((message) => <li key={message.id}><strong>{message.from} to {message.to}:</strong> {message.label}. {message.description}</li>)}</ol>
      <p><strong>Optional branch:</strong> {data.phases.find((phase) => phase.id === "revision")?.description}</p>
      <p><strong>Exhausted-budget bypass:</strong> {data.phases.find((phase) => phase.id === "bypass")?.description}</p>
    </details>

    {selected && <article className={styles.detail} aria-labelledby={detailId}>
      <p className={styles.eyebrow}>{data.walkthroughHeading}: message {selected.ordinal}</p>
      <h3 id={detailId} tabIndex={-1} ref={detailRef}>{selected.heading}</h3>
      <p>{selected.description}</p>
      <div className={styles.artifactGrid}>{selected.artifactIds.map((id) => artifacts.get(id)).filter(visible).map((artifact) => <ArtifactView artifact={artifact} key={artifact.id} />)}</div>
    </article>}

    <section className={styles.practiceArea}>
      <h3>{data.practiceHeading}</h3><p>{data.practiceInstructions}</p>
      {data.practiceGroups.map((group) => {
        const dossier = artifacts.get(group.dossierArtifactId);
        const solution = artifacts.get(group.solutionArtifactId);
        const latestChoice = latest[group.id] ? choices.get(latest[group.id]) : undefined;
        return <section className={styles.practice} key={group.id} tabIndex={-1} ref={(node) => { if (node) practiceRefs.current.set(group.id, node); else practiceRefs.current.delete(group.id); }}>
          <h4>{group.title}</h4>
          {dossier && <ArtifactView artifact={dossier} />}
          <p className={styles.prompt}>{group.prompt}</p>
          <div className={styles.choices}>{group.choiceIds.map((id) => { const choice = choices.get(id); return choice ? <button type="button" key={id} disabled={correct[group.id]} onClick={() => submit(choice)}>{choice.label}</button> : null; })}</div>
          {latestChoice && <aside className={styles.feedback} aria-label={data.feedbackLabel}><strong>{data.feedbackLabel}</strong><p>{latestChoice.feedback}</p>{!latestChoice.correct && <button type="button" onClick={() => retry(group)}>{data.retryLabel}</button>}</aside>}
          {solution && visible(solution) && <ArtifactView artifact={solution} />}
        </section>;
      })}
    </section>

    <section className={styles.panel}><h3>Takeaways</h3><ul>{data.takeaways.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section className={styles.panel}><h3>{data.sourcesHeading}</h3><p>{data.sourcesIntroduction}</p><ul>{data.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><br /><strong>{source.publisher}</strong><p>{source.use}</p></li>)}</ul></section>
    <div className={styles.actions}><button type="button" onClick={reset}>{data.resetLabel}</button></div>
  </section>;
}

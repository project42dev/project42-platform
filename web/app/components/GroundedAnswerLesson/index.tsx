"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./GroundedAnswerLesson.module.css";

export interface GroundedAnswerField { label: string; value: string; }
export type GroundedAnswerArtifactVisibility =
  | { kind: "always" }
  | { kind: "afterAttempt"; groupId: string };
export interface GroundedAnswerArtifact {
  id: string; label: string; title: string; body: string;
  visibility: GroundedAnswerArtifactVisibility; fields?: GroundedAnswerField[];
}
export interface GroundedAnswerNode {
  id: string; kind: "stage" | "decision" | "terminal"; label: string;
  heading: string; description: string; artifactIds: string[]; practiceGroupIds?: string[];
}
export interface GroundedAnswerEdge {
  id: string; from: string; to: string; label: string; route: "forward" | "return";
}
export interface GroundedAnswerChoice {
  id: string; group: string; label: string; correct: boolean; nextNodeId: string;
  announcement: string; feedback: string;
}
export interface GroundedAnswerPracticeGroup {
  id: string; title: string; prompt: string; nodeId: string; choiceIds: string[];
  retryAnnouncement: string;
}
export interface GroundedAnswerSource {
  title: string; publisher: string; url: string; use: string;
}
export interface GroundedAnswerLessonContent {
  schemaVersion: number; id: string; title: string; category: string; summary: string;
  description: string; altText: string; caption: string; takeaways: string[];
  textAlternativeLabel: string; textAlternative: string; safetyNotice: string;
  diagramLabel: string; walkthroughLabel: string; practiceLegend: string;
  feedbackLabel: string; retryLabel: string; resetLabel: string; resetAnnouncement: string;
  attemptsLabel: string; completionLabel: string; pendingCompletion: string;
  earnedCompletion: string; sourcesHeading: string; sourcesIntroduction: string;
  nodes: GroundedAnswerNode[]; edges: GroundedAnswerEdge[];
  artifacts: GroundedAnswerArtifact[]; choices: GroundedAnswerChoice[];
  practiceGroups: GroundedAnswerPracticeGroup[]; sources: GroundedAnswerSource[];
}
export interface GroundedAnswerLessonProps { data: GroundedAnswerLessonContent; }

type Point = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type EdgeGeometry = { id: string; path: string; label: Point };
type NavigationIntent = { token: number; announcement: string };
type LayoutMode = "wide" | "compact";

function relativeBox(element: HTMLElement, host: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return {
    left: rect.left - hostRect.left,
    top: rect.top - hostRect.top,
    right: rect.right - hostRect.left,
    bottom: rect.bottom - hostRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function forwardPath(from: Box, to: Box, compact: boolean): { path: string; label: Point } {
  if (compact) {
    const x1 = from.left + from.width / 2;
    const y1 = from.bottom;
    const x2 = to.left + to.width / 2;
    const y2 = to.top;
    const midY = (y1 + y2) / 2;
    return { path: `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`, label: { x: (x1 + x2) / 2, y: midY } };
  }
  const leftToRight = to.left >= from.right;
  const x1 = leftToRight ? from.right : from.left;
  const y1 = from.top + from.height / 2;
  const x2 = leftToRight ? to.left : to.right;
  const y2 = to.top + to.height / 2;
  const midX = (x1 + x2) / 2;
  const spansRows = y2 > y1 + Math.max(from.height, to.height) * 0.25;
  const label = spansRows
    ? { x: midX, y: (y1 + y2) / 2 }
    : { x: midX, y: y1 };
  return { path: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`, label };
}

function returnPath(from: Box, to: Box, hostWidth: number, compact: boolean): { path: string; label: Point } {
  if (compact) {
    const railX = Math.max(12, Math.min(24, from.left - 16, to.left - 16));
    const x1 = from.left;
    const y1 = from.top + from.height / 2;
    const x2 = to.left;
    const y2 = to.top + to.height / 2;
    const labelX = railX + (Math.min(from.left, to.left) - railX) / 2;
    return {
      path: `M ${x1} ${y1} L ${railX} ${y1} L ${railX} ${y2} L ${x2} ${y2}`,
      label: { x: labelX, y: (y1 + y2) / 2 },
    };
  }

  const x1 = from.left + from.width / 2;
  const y1 = from.top;
  const x2 = to.right;
  const y2 = to.top + to.height / 2;
  const gutterY = to.bottom + (from.top - to.bottom) / 2;
  const railX = Math.min(hostWidth - 12, Math.max(from.right, to.right) + 16);
  return {
    path: `M ${x1} ${y1} L ${x1} ${gutterY} L ${railX} ${gutterY} L ${railX} ${y2} L ${x2} ${y2}`,
    label: { x: x1 + (railX - x1) / 2, y: gutterY },
  };
}

export function GroundedAnswerLesson({ data }: GroundedAnswerLessonProps) {
  const reactId = useId().replace(/:/g, "");
  const titleId = `${reactId}-title`;
  const detailHeadingId = `${reactId}-detail-heading`;
  const sourcesId = `${reactId}-sources`;
  const takeawaysId = `${reactId}-takeaways`;
  const markerId = `${reactId}-arrow`;
  const diagramRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const navigationTokenRef = useRef(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("wide");
  const [edgeGeometry, setEdgeGeometry] = useState<EdgeGeometry[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState(data.nodes[0]?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [attemptedGroups, setAttemptedGroups] = useState<Record<string, boolean>>({});
  const [latestChoiceId, setLatestChoiceId] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [navigationIntent, setNavigationIntent] = useState<NavigationIntent | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const nodesById = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);
  const artifactsById = useMemo(() => new Map(data.artifacts.map((item) => [item.id, item])), [data.artifacts]);
  const choicesById = useMemo(() => new Map(data.choices.map((item) => [item.id, item])), [data.choices]);
  const groupsById = useMemo(() => new Map(data.practiceGroups.map((item) => [item.id, item])), [data.practiceGroups]);
  const currentNode = nodesById.get(currentNodeId) ?? data.nodes[0];
  const latestChoice = latestChoiceId ? choicesById.get(latestChoiceId) ?? null : null;
  const latestGroup = latestChoice ? groupsById.get(latestChoice.group) ?? null : null;
  const complete = data.practiceGroups.length > 0 && data.practiceGroups.every((group) => answers[group.id] === true);
  const visibleArtifacts = (currentNode?.artifactIds ?? []).map((id) => artifactsById.get(id)).filter((artifact): artifact is GroundedAnswerArtifact => Boolean(artifact) && (artifact!.visibility.kind === "always" || attemptedGroups[artifact!.visibility.groupId] === true));

  const measure = useCallback(() => {
    const host = diagramRef.current;
    if (!host) return;
    const compact = window.matchMedia("(max-width: 64rem)").matches;
    setLayoutMode(compact ? "compact" : "wide");
    const boxes = new Map<string, Box>();
    nodeRefs.current.forEach((element, id) => boxes.set(id, relativeBox(element, host)));
    const geometry = data.edges.flatMap((edge) => {
      const from = boxes.get(edge.from);
      const to = boxes.get(edge.to);
      if (!from || !to) return [];
      const measured = edge.route === "return"
        ? returnPath(from, to, host.clientWidth, compact)
        : forwardPath(from, to, compact);
      return [{ id: edge.id, path: measured.path, label: measured.label }];
    });
    setEdgeGeometry(geometry);
  }, [data.edges]);

  useEffect(() => {
    const host = diagramRef.current;
    if (!host) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    nodeRefs.current.forEach((node) => observer.observe(node));
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [measure]);

  useEffect(() => {
    if (!navigationIntent) return;
    detailHeadingRef.current?.focus();
    setAnnouncement(navigationIntent.announcement);
  }, [navigationIntent]);

  function navigate(nodeId: string, message: string, clearFeedback: boolean) {
    if (!nodesById.has(nodeId)) return;
    navigationTokenRef.current += 1;
    setCurrentNodeId(nodeId);
    if (clearFeedback) setLatestChoiceId(null);
    setNavigationIntent({ token: navigationTokenRef.current, announcement: message });
  }

  function browseNode(nodeId: string) {
    const node = nodesById.get(nodeId);
    if (node) navigate(node.id, `${node.label}: ${node.heading}`, true);
  }

  function chooseAnswer(choice: GroundedAnswerChoice) {
    const group = groupsById.get(choice.group);
    if (!group || !nodesById.has(choice.nextNodeId)) return;
    setAttemptCount((count) => count + 1);
    setAttemptedGroups((previous) => ({ ...previous, [group.id]: true }));
    setAnswers((previous) => ({ ...previous, [group.id]: previous[group.id] === true || choice.correct }));
    setLatestChoiceId(choice.id);
    navigate(choice.nextNodeId, choice.announcement, false);
  }

  function retryLatestGroup() {
    if (!latestGroup) return;
    setLatestChoiceId(null);
    navigate(latestGroup.nodeId, latestGroup.retryAnnouncement, false);
  }

  function resetLesson() {
    setAnswers({});
    setAttemptedGroups({});
    setLatestChoiceId(null);
    setAttemptCount(0);
    navigate(data.nodes[0]?.id ?? "", data.resetAnnouncement, false);
  }

  // Diagram stages intentionally retain native button semantics: Tab moves focus,
  // while Enter or Space activates a stage and moves focus to its walkthrough heading.
  return (
    <section className={styles.lesson} aria-labelledby={titleId}>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</p>
      <header className={styles.header}>
        <p className={styles.category}>{data.category}</p>
        <h2 id={titleId}>{data.title}</h2>
        <p>{data.summary}</p><p>{data.description}</p>
        <p className={styles.notice}>{data.safetyNotice}</p>
      </header>
      <section className={styles.status} aria-label={data.completionLabel}>
        <span><strong>{data.attemptsLabel}:</strong> {attemptCount}</span>
        <span><strong>{data.completionLabel}:</strong> {complete ? data.earnedCompletion : data.pendingCompletion}</span>
      </section>

      <div className={styles.diagram} data-layout={layoutMode} ref={diagramRef} role="group" aria-label={data.diagramLabel}>
        <svg className={styles.connectors} aria-hidden="true">
          <defs><marker id={markerId} markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrowHead} /></marker></defs>
          {edgeGeometry.map((edge) => <path className={styles.connectorPath} d={edge.path} key={edge.id} markerEnd={`url(#${markerId})`} />)}
        </svg>
        {data.nodes.map((node) => (
          <button
            aria-pressed={node.id === currentNode?.id}
            className={styles.diagramNode}
            data-kind={node.kind}
            data-node={node.id}
            key={node.id}
            onClick={() => browseNode(node.id)}
            ref={(element) => { if (element) nodeRefs.current.set(node.id, element); else nodeRefs.current.delete(node.id); }}
            type="button"
          ><strong>{node.label}</strong><span>{node.heading}</span></button>
        ))}
        {edgeGeometry.map((geometry) => {
          const edge = data.edges.find((item) => item.id === geometry.id);
          if (!edge) return null;
          const labelStyle = { left: geometry.label.x, top: geometry.label.y } as CSSProperties;
          return <span className={styles.edgeLabel} data-route={edge.route} key={`${edge.id}-label`} style={labelStyle}>{edge.label}</span>;
        })}
      </div>

      <details className={styles.textAlternative}><summary>{data.textAlternativeLabel}</summary><p>{data.textAlternative}</p></details>
      <article className={styles.detail} aria-label={data.walkthroughLabel} aria-labelledby={detailHeadingId}>
        <header className={styles.detailHeader}>
          <p className={styles.stageLabel}>{currentNode?.label}</p>
          <h3 id={detailHeadingId} ref={detailHeadingRef} tabIndex={-1}>{currentNode?.heading}</h3>
          <p>{currentNode?.description}</p>
        </header>
        {visibleArtifacts.length > 0 && <div className={styles.artifacts}>{visibleArtifacts.map((artifact) => (
          <section className={styles.artifact} key={artifact.id}>
            <p className={styles.artifactLabel}>{artifact.label}</p><h4>{artifact.title}</h4><p>{artifact.body}</p>
            {artifact.fields && <dl className={styles.fields}>{artifact.fields.map((field, index) => <div key={`${artifact.id}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}
          </section>
        ))}</div>}
        {currentNode?.practiceGroupIds?.map((groupId) => {
          const group = groupsById.get(groupId); if (!group) return null;
          return <section className={styles.practice} key={group.id}><h4>{group.title}</h4><p>{group.prompt}</p><fieldset><legend>{data.practiceLegend}</legend>{group.choiceIds.map((choiceId) => {
            const choice = choicesById.get(choiceId); if (!choice) return null;
            return <button className={styles.choiceButton} key={choice.id} onClick={() => chooseAnswer(choice)} type="button">{choice.label}</button>;
          })}</fieldset></section>;
        })}
        {latestChoice && <aside className={styles.feedback} aria-label={data.feedbackLabel}><strong>{data.feedbackLabel}</strong><p>{latestChoice.feedback}</p>{!latestChoice.correct && latestGroup && <button className={styles.retryButton} onClick={retryLatestGroup} type="button">{data.retryLabel}</button>}</aside>}
      </article>
      <section className={styles.takeaways} aria-labelledby={takeawaysId}><h3 id={takeawaysId}>{data.caption}</h3><ul>{data.takeaways.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section className={styles.sources} aria-labelledby={sourcesId}><h3 id={sourcesId}>{data.sourcesHeading}</h3><p>{data.sourcesIntroduction}</p><ul>{data.sources.map((source) => <li key={source.url}><a href={source.url} rel="noreferrer" target="_blank">{source.title}</a><span>{source.publisher}</span><p>{source.use}</p></li>)}</ul></section>
      <div className={styles.footerActions}><button onClick={resetLesson} type="button">{data.resetLabel}</button></div>
    </section>
  );
}

export default GroundedAnswerLesson;

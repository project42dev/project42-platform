"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./SafeAgentLesson.module.css";

export interface SafeAgentField {
  label: string;
  value: string;
}

export type SafeAgentArtifactVisibility =
  | { kind: "always" }
  | { kind: "afterAttempt"; groupId: string };

export interface SafeAgentArtifact {
  id: string;
  label: string;
  title: string;
  body: string;
  visibility: SafeAgentArtifactVisibility;
  fields?: SafeAgentField[];
}

export interface SafeAgentNode {
  id: string;
  kind: "stage" | "decision" | "terminal";
  label: string;
  heading: string;
  description: string;
  artifactIds: string[];
  practiceGroupIds?: string[];
}

export interface SafeAgentEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface SafeAgentDiagramItem {
  id: string;
  kind: "node" | "edge";
  refId: string;
  column: number;
  columnSpan: number;
  row: number;
}

export interface SafeAgentChoice {
  id: string;
  group: string;
  label: string;
  correct: boolean;
  nextNodeId: string;
  announcement: string;
  feedback: string;
}

export interface SafeAgentPracticeGroup {
  id: string;
  title: string;
  prompt: string;
  nodeId: string;
  choiceIds: string[];
  retryAnnouncement: string;
}

export interface SafeAgentSource {
  title: string;
  publisher: string;
  url: string;
  use: string;
}

export interface SafeAgentLessonContent {
  schemaVersion: number;
  id: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  altText: string;
  caption: string;
  takeaways: string[];
  textAlternativeLabel: string;
  textAlternative: string;
  safetyNotice: string;
  diagramLabel: string;
  walkthroughLabel: string;
  practiceLegend: string;
  feedbackLabel: string;
  retryLabel: string;
  resetLabel: string;
  resetAnnouncement: string;
  attemptsLabel: string;
  completionLabel: string;
  pendingCompletion: string;
  earnedCompletion: string;
  sourcesHeading: string;
  sourcesIntroduction: string;
  nodes: SafeAgentNode[];
  edges: SafeAgentEdge[];
  diagramItems: SafeAgentDiagramItem[];
  artifacts: SafeAgentArtifact[];
  choices: SafeAgentChoice[];
  practiceGroups: SafeAgentPracticeGroup[];
  sources: SafeAgentSource[];
}

export interface SafeAgentLessonProps {
  data: SafeAgentLessonContent;
}

type NavigationIntent = {
  token: number;
  announcement: string;
};

type DiagramStyle = CSSProperties & {
  "--diagram-column": number;
  "--diagram-span": number;
  "--diagram-row": number;
};

export function SafeAgentLesson({ data }: SafeAgentLessonProps) {
  const instanceId = useId().replace(/:/g, "");
  const lessonHeadingId = `${instanceId}-title`;
  const detailHeadingId = `${instanceId}-detail-heading`;
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const navigationTokenRef = useRef(0);
  const [currentNodeId, setCurrentNodeId] = useState(data.nodes[0]?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [attemptedGroups, setAttemptedGroups] = useState<Record<string, boolean>>({});
  const [latestChoiceId, setLatestChoiceId] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [navigationIntent, setNavigationIntent] = useState<NavigationIntent | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const nodesById = useMemo(
    () => new Map(data.nodes.map((node) => [node.id, node])),
    [data.nodes],
  );
  const edgesById = useMemo(
    () => new Map(data.edges.map((edge) => [edge.id, edge])),
    [data.edges],
  );
  const artifactsById = useMemo(
    () => new Map(data.artifacts.map((artifact) => [artifact.id, artifact])),
    [data.artifacts],
  );
  const choicesById = useMemo(
    () => new Map(data.choices.map((choice) => [choice.id, choice])),
    [data.choices],
  );
  const groupsById = useMemo(
    () => new Map(data.practiceGroups.map((group) => [group.id, group])),
    [data.practiceGroups],
  );

  const currentNode = nodesById.get(currentNodeId) ?? data.nodes[0];
  const latestChoice = latestChoiceId
    ? choicesById.get(latestChoiceId) ?? null
    : null;
  const latestGroup = latestChoice
    ? groupsById.get(latestChoice.group) ?? null
    : null;
  const complete =
    data.practiceGroups.length > 0 &&
    data.practiceGroups.every((group) => answers[group.id] === true);

  const visibleArtifacts = (currentNode?.artifactIds ?? [])
    .map((artifactId) => artifactsById.get(artifactId))
    .filter((artifact): artifact is SafeAgentArtifact => {
      if (!artifact) return false;
      if (artifact.visibility.kind === "always") return true;
      return attemptedGroups[artifact.visibility.groupId] === true;
    });

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
    setNavigationIntent({
      token: navigationTokenRef.current,
      announcement: message,
    });
  }

  function goToNode(nodeId: string) {
    const node = nodesById.get(nodeId);
    if (node) navigate(node.id, node.label, true);
  }

  function chooseAnswer(choice: SafeAgentChoice) {
    const group = groupsById.get(choice.group);
    if (!group || !nodesById.has(choice.nextNodeId)) return;
    setAttemptCount((count) => count + 1);
    setAttemptedGroups((previous) => ({ ...previous, [group.id]: true }));
    setAnswers((previous) => ({
      ...previous,
      [group.id]: previous[group.id] === true || choice.correct,
    }));
    setLatestChoiceId(choice.id);
    navigate(choice.nextNodeId, choice.announcement, false);
  }

  function retryLatestGroup() {
    if (!latestGroup) return;
    setLatestChoiceId(null);
    navigate(latestGroup.nodeId, latestGroup.retryAnnouncement, false);
  }

  function resetLesson() {
    const firstNodeId = data.nodes[0]?.id ?? "";
    setAnswers({});
    setAttemptedGroups({});
    setLatestChoiceId(null);
    setAttemptCount(0);
    navigate(firstNodeId, data.resetAnnouncement, false);
  }

  return (
    <section className={styles.lesson} aria-labelledby={lessonHeadingId}>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <header className={styles.header}>
        <p className={styles.category}>{data.category}</p>
        <h2 id={lessonHeadingId}>{data.title}</h2>
        <p>{data.summary}</p>
        <p className={styles.notice}>{data.safetyNotice}</p>
      </header>

      <section className={styles.status} aria-label={data.completionLabel}>
        <span>
          <strong>{data.attemptsLabel}:</strong> {attemptCount}
        </span>
        <span>
          <strong>{data.completionLabel}:</strong>{" "}
          {complete ? data.earnedCompletion : data.pendingCompletion}
        </span>
      </section>

      <div
        className={styles.diagram}
        role="group"
        aria-label={data.diagramLabel}
      >
        {data.diagramItems.map((item) => {
          const style: DiagramStyle = {
            "--diagram-column": item.column,
            "--diagram-span": item.columnSpan,
            "--diagram-row": item.row,
          };

          if (item.kind === "node") {
            const node = nodesById.get(item.refId);
            if (!node) return null;
            const selected = node.id === currentNode?.id;
            return (
              <button
                aria-pressed={selected}
                className={styles.diagramNode}
                data-kind={node.kind}
                key={item.id}
                onClick={() => goToNode(node.id)}
                style={style}
                type="button"
              >
                <strong>{node.label}</strong>
                <span>{node.heading}</span>
              </button>
            );
          }

          const edge = edgesById.get(item.refId);
          if (!edge) return null;
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          return (
            <div className={styles.diagramEdge} key={item.id} style={style}>
              <span className={styles.edgeFrom}>{from?.label ?? edge.from}</span>
              <span className={styles.edgeRoute}>{edge.label}</span>
              <span aria-hidden="true" className={styles.arrow}>→</span>
              <span className={styles.edgeTo}>{to?.label ?? edge.to}</span>
            </div>
          );
        })}
      </div>

      <details className={styles.textAlternative}>
        <summary>{data.textAlternativeLabel}</summary>
        <p>{data.textAlternative}</p>
      </details>

      <article
        className={styles.detail}
        aria-label={data.walkthroughLabel}
        aria-labelledby={detailHeadingId}
      >
        <header className={styles.detailHeader}>
          <p className={styles.stageLabel}>{currentNode?.label}</p>
          <h3 id={detailHeadingId} ref={detailHeadingRef} tabIndex={-1}>
            {currentNode?.heading}
          </h3>
          <p>{currentNode?.description}</p>
        </header>

        {visibleArtifacts.length > 0 && (
          <div className={styles.artifacts}>
            {visibleArtifacts.map((artifact) => (
              <section className={styles.artifact} key={artifact.id}>
                <p className={styles.artifactLabel}>{artifact.label}</p>
                <h4>{artifact.title}</h4>
                <p>{artifact.body}</p>
                {artifact.fields && (
                  <dl className={styles.fields}>
                    {artifact.fields.map((field) => (
                      <div key={`${artifact.id}-${field.label}`}>
                        <dt>{field.label}</dt>
                        <dd>{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            ))}
          </div>
        )}

        {currentNode?.practiceGroupIds?.map((groupId) => {
          const group = groupsById.get(groupId);
          if (!group) return null;
          return (
            <section className={styles.practice} key={group.id}>
              <h4>{group.title}</h4>
              <p>{group.prompt}</p>
              <fieldset>
                <legend>{data.practiceLegend}</legend>
                {group.choiceIds.map((choiceId) => {
                  const choice = choicesById.get(choiceId);
                  if (!choice) return null;
                  return (
                    <button
                      className={styles.choiceButton}
                      key={choice.id}
                      onClick={() => chooseAnswer(choice)}
                      type="button"
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </fieldset>
            </section>
          );
        })}

        {latestChoice && (
          <aside className={styles.feedback} aria-label={data.feedbackLabel}>
            <strong>{data.feedbackLabel}</strong>
            <p>{latestChoice.feedback}</p>
            {!latestChoice.correct && latestGroup && (
              <button
                className={styles.retryButton}
                onClick={retryLatestGroup}
                type="button"
              >
                {data.retryLabel}
              </button>
            )}
          </aside>
        )}
      </article>

      <section className={styles.sources} aria-labelledby={`${instanceId}-sources`}>
        <h3 id={`${instanceId}-sources`}>{data.sourcesHeading}</h3>
        <p>{data.sourcesIntroduction}</p>
        <ul>
          {data.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noreferrer" target="_blank">
                {source.title}
              </a>
              <span>{source.publisher}</span>
              <p>{source.use}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.footerActions}>
        <button onClick={resetLesson} type="button">
          {data.resetLabel}
        </button>
      </div>
    </section>
  );
}


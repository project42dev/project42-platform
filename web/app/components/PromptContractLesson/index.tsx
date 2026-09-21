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
import styles from "./PromptContractLesson.module.css";

export interface PromptContractField {
  label: string;
  value: string;
}

export type PromptContractArtifactVisibility =
  | { kind: "always" }
  | { kind: "afterAttempt"; groupId: string };

export interface PromptContractArtifact {
  id: string;
  label: string;
  title: string;
  body: string;
  visibility: PromptContractArtifactVisibility;
  fields?: PromptContractField[];
}

export interface PromptContractNode {
  id: string;
  kind: "stage" | "decision" | "terminal";
  label: string;
  heading: string;
  description: string;
  artifactIds: string[];
  practiceGroupIds?: string[];
}

export interface PromptContractEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  route: "forward" | "return";
}

export interface PromptContractChoice {
  id: string;
  group: string;
  label: string;
  correct: boolean;
  nextNodeId: string;
  announcement: string;
  feedback: string;
}

export interface PromptContractPracticeGroup {
  id: string;
  title: string;
  prompt: string;
  nodeId: string;
  choiceIds: string[];
  retryAnnouncement: string;
}

export interface PromptContractSource {
  title: string;
  publisher: string;
  url: string;
  use: string;
}

export interface PromptContractLessonContent {
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
  nodes: PromptContractNode[];
  edges: PromptContractEdge[];
  artifacts: PromptContractArtifact[];
  choices: PromptContractChoice[];
  practiceGroups: PromptContractPracticeGroup[];
  sources: PromptContractSource[];
}

export interface PromptContractLessonProps {
  data: PromptContractLessonContent;
}

type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type Point = { x: number; y: number };
type EdgeGeometry = { id: string; path: string; label: Point };
type NavigationIntent = { token: number; announcement: string };

function relativeBox(element: HTMLElement, host: HTMLElement): Box {
  const rectangle = element.getBoundingClientRect();
  const hostRectangle = host.getBoundingClientRect();
  return {
    left: rectangle.left - hostRectangle.left,
    top: rectangle.top - hostRectangle.top,
    right: rectangle.right - hostRectangle.left,
    bottom: rectangle.bottom - hostRectangle.top,
    width: rectangle.width,
    height: rectangle.height,
  };
}

function forwardPath(from: Box, to: Box): { path: string; label: Point } {
  const x1 = from.left + from.width / 2;
  const y1 = from.bottom;
  const x2 = to.left + to.width / 2;
  const y2 = to.top;
  const midY = y1 + (y2 - y1) / 2;
  return {
    path: `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`,
    label: { x: (x1 + x2) / 2, y: midY },
  };
}

function returnPath(
  from: Box,
  to: Box,
  hostWidth: number,
  returnIndex: number,
  compact: boolean,
): { path: string; label: Point } {
  const x1 = from.right;
  const y1 = from.top + from.height / 2;
  const x2 = to.right;
  const y2 = to.top + to.height / 2;
  const railInset = compact ? 16 + returnIndex * 18 : 30 + returnIndex * 28;
  const railX = Math.max(Math.max(from.right, to.right) + 12, hostWidth - railInset);
  const labelX = compact ? hostWidth - 56 : hostWidth - 88;
  const labelY = y2 + (y1 - y2) * (returnIndex === 0 ? 0.25 : 0.5);
  return {
    path: `M ${x1} ${y1} L ${railX} ${y1} L ${railX} ${y2} L ${x2} ${y2}`,
    label: { x: labelX, y: labelY },
  };
}

export default function PromptContractLesson({ data }: PromptContractLessonProps) {
  const instanceId = useId().replace(/:/g, "");
  const titleId = `${instanceId}-title`;
  const detailHeadingId = `${instanceId}-detail-heading`;
  const takeawaysId = `${instanceId}-takeaways`;
  const sourcesId = `${instanceId}-sources`;
  const markerId = `${instanceId}-arrow`;
  const diagramRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const navigationToken = useRef(0);
  const [currentNodeId, setCurrentNodeId] = useState(data.nodes[0]?.id ?? "");
  const [edgeGeometry, setEdgeGeometry] = useState<EdgeGeometry[]>([]);
  const [attemptedGroups, setAttemptedGroups] = useState<Record<string, boolean>>({});
  const [correctGroups, setCorrectGroups] = useState<Record<string, boolean>>({});
  const [latestChoiceId, setLatestChoiceId] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [navigationIntent, setNavigationIntent] = useState<NavigationIntent | null>(null);

  const nodesById = useMemo(
    () => new Map(data.nodes.map((node) => [node.id, node])),
    [data.nodes],
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
  const latestChoice = latestChoiceId ? choicesById.get(latestChoiceId) ?? null : null;
  const latestGroup = latestChoice ? groupsById.get(latestChoice.group) ?? null : null;
  const complete =
    data.practiceGroups.length > 0 &&
    data.practiceGroups.every((group) => correctGroups[group.id] === true);

  const currentArtifacts = (currentNode?.artifactIds ?? [])
    .map((id) => artifactsById.get(id))
    .filter((artifact): artifact is PromptContractArtifact => {
      if (!artifact) return false;
      return (
        artifact.visibility.kind === "always" ||
        attemptedGroups[artifact.visibility.groupId] === true
      );
    });

  const currentArtifactIds = new Set(currentArtifacts.map((artifact) => artifact.id));
  const attemptedExplanations = data.artifacts.filter(
    (artifact) =>
      artifact.visibility.kind === "afterAttempt" &&
      attemptedGroups[artifact.visibility.groupId] === true &&
      !currentArtifactIds.has(artifact.id),
  );

  const measure = useCallback(() => {
    const host = diagramRef.current;
    if (!host) return;

    const mediaQuery = window.matchMedia('(max-width: 64rem)');
    const compact = mediaQuery.matches;
    const boxes = new Map<string, Box>();
    nodeRefs.current.forEach((element, id) => {
      boxes.set(id, relativeBox(element, host));
    });

    let returnIndex = 0;
    const measured = data.edges.flatMap((edge) => {
      const from = boxes.get(edge.from);
      const to = boxes.get(edge.to);
      if (!from || !to) return [];

      if (edge.route === "return") {
        const geometry = returnPath(from, to, host.clientWidth, returnIndex, compact);
        returnIndex += 1;
        return [{ id: edge.id, path: geometry.path, label: geometry.label }];
      }

      const geometry = forwardPath(from, to);
      return [{ id: edge.id, path: geometry.path, label: geometry.label }];
    });

    setEdgeGeometry(measured);
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

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    if (!navigationIntent) return;
    detailHeadingRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- announce focus-driven lesson navigation to assistive technology
    setAnnouncement(navigationIntent.announcement);
  }, [navigationIntent]);

  function navigate(nodeId: string, message: string, clearFeedback: boolean) {
    if (!nodesById.has(nodeId)) return;
    navigationToken.current += 1;
    setCurrentNodeId(nodeId);
    if (clearFeedback) setLatestChoiceId(null);
    setNavigationIntent({ token: navigationToken.current, announcement: message });
  }

  function browseNode(nodeId: string) {
    const node = nodesById.get(nodeId);
    if (!node) return;
    navigate(node.id, `${node.label}: ${node.heading}`, true);
  }

  function chooseAnswer(choice: PromptContractChoice) {
    const group = groupsById.get(choice.group);
    if (!group || !nodesById.has(choice.nextNodeId)) return;

    setAttemptCount((count) => count + 1);
    setAttemptedGroups((previous) => ({ ...previous, [group.id]: true }));
    setCorrectGroups((previous) => ({
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
    setAttemptedGroups({});
    setCorrectGroups({});
    setLatestChoiceId(null);
    setAttemptCount(0);
    navigate(data.nodes[0]?.id ?? "", data.resetAnnouncement, false);
  }

  function renderArtifact(artifact: PromptContractArtifact) {
    return (
      <section className={styles.artifact} key={artifact.id}>
        <p className={styles.artifactLabel}>{artifact.label}</p>
        <h4>{artifact.title}</h4>
        <p className={styles.artifactBody}>{artifact.body}</p>
        {artifact.fields && (
          <dl className={styles.fields}>
            {artifact.fields.map((field, index) => (
              <div key={`${artifact.id}-${index}`}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    );
  }

  return (
    <section className={styles.lesson} aria-labelledby={titleId}>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <header className={styles.header}>
        <p className={styles.category}>{data.category}</p>
        <h2 id={titleId}>{data.title}</h2>
        <p>{data.summary}</p>
        <p>{data.description}</p>
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
        ref={diagramRef}
        role="group"
        aria-label={data.diagramLabel}
      >
        <svg className={styles.connectors} aria-hidden="true">
          <defs>
            <marker
              id={markerId}
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrowHead} />
            </marker>
          </defs>
          {edgeGeometry.map((edge) => (
            <path
              className={styles.connectorPath}
              d={edge.path}
              key={edge.id}
              markerEnd={`url(#${markerId})`}
            />
          ))}
        </svg>

        {data.nodes.map((node) => (
          <button
            aria-pressed={node.id === currentNode?.id}
            className={styles.diagramNode}
            data-kind={node.kind}
            data-node={node.id}
            key={node.id}
            onClick={() => browseNode(node.id)}
            ref={(element) => {
              if (element) nodeRefs.current.set(node.id, element);
              else nodeRefs.current.delete(node.id);
            }}
            type="button"
          >
            <strong>{node.label}</strong>
            <span>{node.heading}</span>
          </button>
        ))}

        {edgeGeometry.map((geometry) => {
          const edge = data.edges.find((candidate) => candidate.id === geometry.id);
          if (!edge) return null;
          const labelStyle = {
            left: geometry.label.x,
            top: geometry.label.y,
          } as CSSProperties;
          return (
            <span
              className={styles.edgeLabel}
              data-route={edge.route}
              key={`${edge.id}-label`}
              style={labelStyle}
            >
              {edge.label}
            </span>
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

        {currentArtifacts.length > 0 && (
          <div className={styles.artifacts}>
            {currentArtifacts.map(renderArtifact)}
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

        {attemptedExplanations.length > 0 && (
          <div className={styles.explanations}>
            {attemptedExplanations.map(renderArtifact)}
          </div>
        )}
      </article>

      <section className={styles.takeaways} aria-labelledby={takeawaysId}>
        <h3 id={takeawaysId}>{data.caption}</h3>
        <ul>
          {data.takeaways.map((takeaway) => (
            <li key={takeaway}>{takeaway}</li>
          ))}
        </ul>
      </section>

      <section className={styles.sources} aria-labelledby={sourcesId}>
        <h3 id={sourcesId}>{data.sourcesHeading}</h3>
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

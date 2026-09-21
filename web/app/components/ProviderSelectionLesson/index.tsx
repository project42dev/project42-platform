"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import styles from "./ProviderSelectionLesson.module.css";

export type ArtifactVisibility = { kind: "always" };

export interface ProviderSelectionLessonContent {
  schemaVersion: number;
  id: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  safetyNotice: string;
  diagramLabel: string;
  textAlternativeLabel: string;
  textAlternative: string;
  walkthroughHeading: string;
  evidenceHeading: string;
  practiceHeading: string;
  practiceInstructions: string;
  feedbackHeading: string;
  retryLabel: string;
  resetLabel: string;
  attemptsLabel: string;
  completionLabel: string;
  pendingCompletion: string;
  earnedCompletion: string;
  sourcesHeading: string;
  sourcesIntroduction: string;
  takeawaysHeading: string;
  takeaways: string[];
  nodes: Array<{
    id: string;
    label: string;
    kind: "stage" | "decision" | "terminal";
    heading: string;
    description: string;
    artifactIds: string[];
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    label: string;
    route: "forward" | "branch" | "join" | "return";
  }>;
  artifacts: Array<{
    id: string;
    label: string;
    title: string;
    body: string;
    visibility: ArtifactVisibility;
    fields?: Array<{ label: string; value: string }>;
  }>;
  practiceGroups: Array<{
    id: string;
    title: string;
    prompt: string;
    choiceIds: string[];
    solutionTitle: string;
    solution: string;
  }>;
  choices: Array<{
    id: string;
    groupId: string;
    label: string;
    correct: boolean;
    feedback: string;
  }>;
  sources: Array<{
    title: string;
    publisher: string;
    url: string;
    checkedAt: string;
    use: string;
  }>;
}

export interface ProviderSelectionLessonProps {
  data: ProviderSelectionLessonContent;
}

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type DrawnEdge = {
  id: string;
  path: string;
  labelX?: number;
  labelY?: number;
  labelClass?: string;
};

function relativeRect(element: HTMLElement, host: HTMLElement): Rect {
  const elementRect = element.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return {
    left: elementRect.left - hostRect.left,
    top: elementRect.top - hostRect.top,
    right: elementRect.right - hostRect.left,
    bottom: elementRect.bottom - hostRect.top,
    width: elementRect.width,
    height: elementRect.height,
  };
}

function centerX(rect: Rect) {
  return rect.left + rect.width / 2;
}

function centerY(rect: Rect) {
  return rect.top + rect.height / 2;
}

/**
 * Generic native renderer for canonical provider-selection content.
 * Learner-facing prose, fixtures, scores, labels, and sources are supplied by data.
 */
export default function ProviderSelectionLesson({ data }: ProviderSelectionLessonProps) {
  const uid = useId().replace(/:/g, "");
  const titleId = `${uid}-title`;
  const detailId = `${uid}-detail`;
  const markerId = `${uid}-arrow`;
  const hostRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const feedbackRefs = useRef(new Map<string, HTMLDivElement>());
  const [selectedNodeId, setSelectedNodeId] = useState(data.nodes[0]?.id ?? "");
  const [drawnEdges, setDrawnEdges] = useState<DrawnEdge[]>([]);
  const [attempted, setAttempted] = useState<Record<string, boolean>>({});
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({});
  const [attemptCount, setAttemptCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const nodeMap = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);
  const artifactMap = useMemo(() => new Map(data.artifacts.map((artifact) => [artifact.id, artifact])), [data.artifacts]);
  const choiceMap = useMemo(() => new Map(data.choices.map((choice) => [choice.id, choice])), [data.choices]);
  const selectedNode = nodeMap.get(selectedNodeId) ?? data.nodes[0];
  const completed = data.practiceGroups.length > 0 && data.practiceGroups.every((group) => solved[group.id]);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    const boxes = new Map<string, Rect>();
    nodeRefs.current.forEach((element, id) => boxes.set(id, relativeRect(element, host)));
    const isCompact = window.matchMedia("(max-width: 64rem)").matches;
    const width = host.clientWidth;
    const get = (id: string) => boxes.get(id);
    const next: DrawnEdge[] = [];

    for (const edge of data.edges) {
      const from = get(edge.from);
      const to = get(edge.to);
      if (!from || !to) continue;

      if (edge.id === "D-M") {
        const branchLeft = Math.min(
          ...["Q", "O", "P"].map((id) => get(id)?.left ?? from.left),
        );
        const railX = isCompact ? 18 : Math.max(24, branchLeft - 24);
        const startX = from.left;
        const startY = centerY(from);
        const endX = to.left;
        const endY = centerY(to);
        next.push({
          id: edge.id,
          path: `M ${startX} ${startY} L ${railX} ${startY} L ${railX} ${endY} L ${endX} ${endY}`,
          labelX: railX,
          labelY: startY - 20,
          labelClass: "shortReturnLabel",
        });
        continue;
      }

      if (edge.id === "V-M") {
        const railX = width - (isCompact ? 14 : 26);
        const startX = centerX(from);
        const startY = from.bottom;
        const bottomY = from.bottom + (isCompact ? 64 : 54);
        const endX = to.right;
        const endY = centerY(to);
        next.push({
          id: edge.id,
          path: `M ${startX} ${startY} L ${startX} ${bottomY} L ${railX} ${bottomY} L ${railX} ${endY} L ${endX} ${endY}`,
          labelX: isCompact ? width / 2 : width - 120,
          labelY: bottomY - 20,
          labelClass: "changeLabel",
        });
        continue;
      }

      if (edge.route === "branch") {
        const splitY = isCompact
          ? from.bottom + 12
          : from.bottom + Math.max(18, (to.top - from.bottom) * 0.38);
        if (isCompact && (edge.id === "E-O" || edge.id === "E-P")) {
          const railX = edge.id === "E-O"
            ? Math.max(12, Math.min(from.left, to.left) - 24)
            : Math.min(width - 12, Math.max(from.right, to.right) + 24);
          const approachY = to.top - 12;
          next.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${splitY} L ${railX} ${splitY} L ${railX} ${approachY} L ${centerX(to)} ${approachY} L ${centerX(to)} ${to.top}`,
          });
        } else {
          next.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${splitY} L ${centerX(to)} ${splitY} L ${centerX(to)} ${to.top}`,
          });
        }
        continue;
      }

      if (edge.route === "join") {
        const joinY = isCompact
          ? from.bottom + 12
          : from.bottom + Math.max(18, (to.top - from.bottom) * 0.62);
        if (isCompact && (edge.id === "Q-D" || edge.id === "O-D")) {
          const railX = edge.id === "Q-D"
            ? Math.min(width - 12, Math.max(from.right, to.right) + 24)
            : Math.max(12, Math.min(from.left, to.left) - 24);
          const approachY = to.top - 12;
          next.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${joinY} L ${railX} ${joinY} L ${railX} ${approachY} L ${centerX(to)} ${approachY} L ${centerX(to)} ${to.top}`,
          });
        } else {
          next.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${joinY} L ${centerX(to)} ${joinY} L ${centerX(to)} ${to.top}`,
          });
        }
        continue;
      }

      const midY = from.bottom + (to.top - from.bottom) / 2;
      next.push({
        id: edge.id,
        path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${midY} L ${centerX(to)} ${midY} L ${centerX(to)} ${to.top}`,
        labelX: edge.label ? centerX(from) + 30 : undefined,
        labelY: edge.label ? midY : undefined,
        labelClass: edge.id === "D-R" ? "yesLabel" : undefined,
      });
    }

    setDrawnEdges(next);
  }, [data.edges]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    nodeRefs.current.forEach((element) => observer.observe(element));
    const media = window.matchMedia("(max-width: 64rem)");
    media.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", schedule);
    };
  }, [measure]);

  function selectNode(id: string, moveFocus: boolean) {
    if (!nodeMap.has(id)) return;
    setSelectedNodeId(id);
    setAnnouncement(nodeMap.get(id)?.heading ?? "");
    if (moveFocus) requestAnimationFrame(() => detailRef.current?.focus());
  }

  function handleNodeKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(data.nodes.length - 1, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = data.nodes.length - 1;
    else return;
    event.preventDefault();
    nodeRefs.current.get(data.nodes[nextIndex].id)?.focus();
  }

  function answer(groupId: string, choiceId: string) {
    const choice = choiceMap.get(choiceId);
    if (!choice || choice.groupId !== groupId) return;
    setAttemptCount((count) => count + 1);
    setAttempted((state) => ({ ...state, [groupId]: true }));
    setSolved((state) => ({ ...state, [groupId]: Boolean(state[groupId] || choice.correct) }));
    setSelectedChoices((state) => ({ ...state, [groupId]: choiceId }));
    setAnnouncement(choice.correct ? `Correct. ${choice.feedback}` : `Incorrect. ${choice.feedback}`);
    requestAnimationFrame(() => feedbackRefs.current.get(groupId)?.focus());
  }

  function retry(groupId: string) {
    setSelectedChoices((state) => {
      const next = { ...state };
      delete next[groupId];
      return next;
    });
    setAnnouncement("Case ready for another attempt.");
  }

  function reset() {
    setAttempted({});
    setSolved({});
    setSelectedChoices({});
    setAttemptCount(0);
    setAnnouncement("All practice progress has been reset.");
  }

  const visibleArtifacts = (selectedNode?.artifactIds ?? [])
    .map((id) => artifactMap.get(id))
    .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact));

  return (
    <section className={styles.lesson} aria-labelledby={titleId}>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</p>

      <header className={styles.panel}>
        <p className={styles.eyebrow}>{data.category}</p>
        <h2 id={titleId}>{data.title}</h2>
        <p>{data.summary}</p>
        <p>{data.description}</p>
        <p className={styles.notice}>{data.safetyNotice}</p>
      </header>

      <div className={styles.status} aria-label={data.completionLabel}>
        <span><strong>{data.attemptsLabel}:</strong> {attemptCount}</span>
        <span><strong>{data.completionLabel}:</strong> {completed ? data.earnedCompletion : data.pendingCompletion}</span>
      </div>

      <div ref={hostRef} className={styles.diagram} role="group" aria-label={data.diagramLabel}>
        <svg className={styles.connectors} aria-hidden="true">
          <defs>
            <marker id={markerId} markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M 0 0 L 10 5 L 0 10 Z" className={styles.arrowHead} />
            </marker>
          </defs>
          {drawnEdges.map((edge) => (
            <path key={edge.id} d={edge.path} className={styles.connector} markerEnd={`url(#${markerId})`} />
          ))}
        </svg>

        {data.nodes.map((node, index) => (
          <button
            key={node.id}
            ref={(element) => {
              if (element) nodeRefs.current.set(node.id, element);
              else nodeRefs.current.delete(node.id);
            }}
            type="button"
            className={styles.node}
            data-node={node.id}
            data-kind={node.kind}
            aria-pressed={selectedNode?.id === node.id}
            onClick={() => selectNode(node.id, true)}
            onKeyDown={(event) => handleNodeKey(event, index)}
          >
            <strong>{node.label}</strong>
            <span>{node.heading}</span>
          </button>
        ))}

        {drawnEdges.map((drawn) => {
          const edge = data.edges.find((item) => item.id === drawn.id);
          if (!edge?.label || drawn.labelX === undefined || drawn.labelY === undefined) return null;
          return (
            <span
              key={`${drawn.id}-label`}
              className={`${styles.edgeLabel} ${drawn.labelClass ? styles[drawn.labelClass] : ""}`}
              style={{ left: drawn.labelX, top: drawn.labelY }}
            >
              {edge.label}
            </span>
          );
        })}
      </div>

      <details className={styles.panel}>
        <summary>{data.textAlternativeLabel}</summary>
        <p>{data.textAlternative}</p>
      </details>

      <article className={styles.panel} aria-labelledby={detailId}>
        <p className={styles.eyebrow}>{data.walkthroughHeading}: {selectedNode?.label}</p>
        <h3 id={detailId} ref={detailRef} tabIndex={-1}>{selectedNode?.heading}</h3>
        <p>{selectedNode?.description}</p>
        <h4>{data.evidenceHeading}</h4>
        <div className={styles.cards}>
          {visibleArtifacts.map((artifact) => (
            <section className={styles.artifact} key={artifact.id}>
              <p className={styles.eyebrow}>{artifact.label}</p>
              <h5>{artifact.title}</h5>
              <p className={styles.preserve}>{artifact.body}</p>
              {artifact.fields && (
                <dl>
                  {artifact.fields.map((field, index) => (
                    <div key={`${artifact.id}-${index}`}>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
        </div>
      </article>

      <section className={styles.panel} aria-labelledby={`${uid}-practice`}>
        <h3 id={`${uid}-practice`}>{data.practiceHeading}</h3>
        <p>{data.practiceInstructions}</p>
        <div className={styles.practiceGrid}>
          {data.practiceGroups.map((group) => {
            const selectedChoiceId = selectedChoices[group.id];
            const selectedChoice = selectedChoiceId ? choiceMap.get(selectedChoiceId) : undefined;
            return (
              <section className={styles.practice} key={group.id}>
                <h4>{group.title}</h4>
                <p>{group.prompt}</p>
                <fieldset>
                  <legend className={styles.srOnly}>{group.title}</legend>
                  {group.choiceIds.map((choiceId) => (
                    <button key={choiceId} type="button" onClick={() => answer(group.id, choiceId)}>
                      {choiceMap.get(choiceId)?.label}
                    </button>
                  ))}
                </fieldset>
                {attempted[group.id] && selectedChoice && (
                  <div
                    ref={(element) => {
                      if (element) feedbackRefs.current.set(group.id, element);
                      else feedbackRefs.current.delete(group.id);
                    }}
                    className={styles.feedback}
                    tabIndex={-1}
                  >
                    <h5>{data.feedbackHeading}</h5>
                    <p>{selectedChoice.feedback}</p>
                    <h5>{group.solutionTitle}</h5>
                    <p>{group.solution}</p>
                    {!selectedChoice.correct && (
                      <button type="button" onClick={() => retry(group.id)}>{data.retryLabel}</button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={reset}>{data.resetLabel}</button>
        </div>
      </section>

      <section className={styles.panel}>
        <h3>{data.takeawaysHeading}</h3>
        <ul>{data.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul>
      </section>

      <section className={styles.panel}>
        <h3>{data.sourcesHeading}</h3>
        <p>{data.sourcesIntroduction}</p>
        <ul className={styles.sources}>
          {data.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
              <strong>{source.publisher}</strong>
              <span>Checked: {source.checkedAt}</span>
              <p>{source.use}</p>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

export { ProviderSelectionLesson };

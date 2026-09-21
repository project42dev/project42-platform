"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import styles from "./AgentOrchestrationLesson.module.css";

type Node = { id: string; label: string; kind: "stage" | "decision" | "terminal"; heading: string; description: string; artifactIds: string[] };
type Edge = { id: string; from: string; to: string; label: string; route: "forward" | "branch" | "join" | "return" };
type Artifact = { id: string; label: string; title: string; body: string; visibility: { kind: "always" }; fields?: { label: string; value: string }[] };
type PracticeGroup = { id: string; title: string; prompt: string; choiceIds: string[]; solutionTitle: string; solution: string };
type Choice = { id: string; groupId: string; label: string; correct: boolean; feedback: string };
type Source = { title: string; publisher: string; url: string; checkedAt: string; use: string };
type Simulation = { heading: string; description: string; runLabel: string; resetLabel: string; pendingLabel: string; failedLabel: string; passedLabel: string; executionDisclaimer: string; initialOutput: string; repairedOutput: string; expectedOutput: string };

export interface AgentOrchestrationLessonContent {
  schemaVersion: number; id: string; title: string; category: string; summary: string; description: string; safetyNotice: string;
  diagramLabel: string; textAlternativeLabel: string; textAlternative: string; walkthroughHeading: string; evidenceHeading: string;
  practiceHeading: string; practiceInstructions: string; feedbackHeading: string; retryLabel: string; resetLabel: string;
  attemptsLabel: string; completionLabel: string; pendingCompletion: string; earnedCompletion: string; takeawaysHeading: string;
  takeaways: string[]; simulation: Simulation; nodes: Node[]; edges: Edge[]; artifacts: Artifact[]; practiceGroups: PracticeGroup[];
  choices: Choice[]; sourcesHeading: string; sourcesIntroduction: string; sources: Source[];
}

export interface AgentOrchestrationLessonProps { data: AgentOrchestrationLessonContent }
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type DrawnEdge = { id: string; path: string; labelX?: number; labelY?: number };

function relativeRect(element: HTMLElement, host: HTMLElement): Rect {
  const elementRect = element.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return {
    left: elementRect.left - hostRect.left,
    top: elementRect.top - hostRect.top,
    right: elementRect.right - hostRect.left,
    bottom: elementRect.bottom - hostRect.top,
    width: elementRect.width,
    height: elementRect.height
  };
}

const centerX = (rect: Rect) => rect.left + rect.width / 2;
const centerY = (rect: Rect) => rect.top + rect.height / 2;

export default function AgentOrchestrationLesson({ data }: AgentOrchestrationLessonProps) {
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
  const [simulationState, setSimulationState] = useState<"pending" | "complete">("pending");

  const nodeMap = useMemo(() => new Map(data.nodes.map(node => [node.id, node])), [data.nodes]);
  const artifactMap = useMemo(() => new Map(data.artifacts.map(item => [item.id, item])), [data.artifacts]);
  const choiceMap = useMemo(() => new Map(data.choices.map(choice => [choice.id, choice])), [data.choices]);
  const selectedNode = nodeMap.get(selectedNodeId) ?? data.nodes[0];
  const completed = data.practiceGroups.length > 0 && data.practiceGroups.every(group => solved[group.id]);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;

    const boxes = new Map<string, Rect>();
    nodeRefs.current.forEach((element, id) => boxes.set(id, relativeRect(element, host)));
    if (boxes.size === 0) return;

    const compact = window.matchMedia("(max-width: 64rem)").matches;
    const width = host.clientWidth;
    const allBoxes = Array.from(boxes.values());
    const minimumLeft = Math.min(...allBoxes.map(box => box.left));
    const maximumRight = Math.max(...allBoxes.map(box => box.right));
    const leftOuter = Math.max(8, minimumLeft - 52);
    const leftInner = Math.max(12, minimumLeft - 28);
    const rightInner = Math.min(width - 12, maximumRight + 28);
    const rightOuter = Math.min(width - 8, maximumRight + 52);
    const compactBranchLanes: Record<string, number | undefined> = {
      "D-C": undefined,
      "D-RV": leftInner,
      "D-I": rightInner,
      "D-O": leftOuter
    };
    const compactJoinLanes: Record<string, number | undefined> = {
      "C-W": leftOuter,
      "RV-W": leftInner,
      "I-W": rightInner,
      "O-W": undefined
    };
    const output: DrawnEdge[] = [];

    for (const edge of data.edges) {
      const from = boxes.get(edge.from);
      const to = boxes.get(edge.to);
      if (!from || !to) continue;

      if (edge.route === "return") {
        const railX = compact ? rightOuter : Math.min(width - 22, maximumRight + 38);
        const startY = centerY(from);
        const endY = centerY(to);
        output.push({
          id: edge.id,
          path: `M ${from.right} ${startY} L ${railX} ${startY} L ${railX} ${endY} L ${to.right} ${endY}`,
          labelX: railX,
          labelY: compact ? from.top - 31 : startY - 24
        });
        continue;
      }

      if (edge.route === "branch") {
        const departureY = from.bottom + 14;
        const approachY = to.top - 14;
        const lane = compact ? compactBranchLanes[edge.id] : undefined;
        if (compact && lane !== undefined) {
          output.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${departureY} L ${lane} ${departureY} L ${lane} ${approachY} L ${centerX(to)} ${approachY} L ${centerX(to)} ${to.top}`,
            labelX: centerX(to),
            labelY: to.top - 31
          });
        } else {
          const turnY = compact ? from.bottom + (to.top - from.bottom) / 2 : departureY;
          output.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${turnY} L ${centerX(to)} ${turnY} L ${centerX(to)} ${to.top}`,
            labelX: centerX(to),
            labelY: compact ? turnY : to.top - 29
          });
        }
        continue;
      }

      if (edge.route === "join") {
        const departureY = from.bottom + 14;
        const approachY = to.top - 14;
        const lane = compact ? compactJoinLanes[edge.id] : undefined;
        if (compact && lane !== undefined) {
          output.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${departureY} L ${lane} ${departureY} L ${lane} ${approachY} L ${centerX(to)} ${approachY} L ${centerX(to)} ${to.top}`
          });
        } else if (compact) {
          const turnY = from.bottom + (to.top - from.bottom) / 2;
          output.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${turnY} L ${centerX(to)} ${turnY} L ${centerX(to)} ${to.top}`
          });
        } else {
          const joinY = to.top - 18;
          output.push({
            id: edge.id,
            path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${joinY} L ${centerX(to)} ${joinY} L ${centerX(to)} ${to.top}`
          });
        }
        continue;
      }

      const midY = from.bottom + (to.top - from.bottom) / 2;
      output.push({
        id: edge.id,
        path: `M ${centerX(from)} ${from.bottom} L ${centerX(from)} ${midY} L ${centerX(to)} ${midY} L ${centerX(to)} ${to.top}`,
        labelX: edge.label ? centerX(from) : undefined,
        labelY: edge.label ? midY : undefined
      });
    }

    setDrawnEdges(output);
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
    nodeRefs.current.forEach(element => observer.observe(element));
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
    const node = nodeMap.get(id);
    if (!node) return;
    setSelectedNodeId(id);
    setAnnouncement(node.heading);
    if (moveFocus) requestAnimationFrame(() => detailRef.current?.focus());
  }

  function handleNodeKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(data.nodes.length - 1, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = data.nodes.length - 1;
    else return;
    event.preventDefault();
    nodeRefs.current.get(data.nodes[next].id)?.focus();
  }

  function answer(groupId: string, choiceId: string) {
    const choice = choiceMap.get(choiceId);
    if (!choice || choice.groupId !== groupId) return;
    setAttemptCount(count => count + 1);
    setAttempted(state => ({ ...state, [groupId]: true }));
    setSolved(state => ({ ...state, [groupId]: Boolean(state[groupId] || choice.correct) }));
    setSelectedChoices(state => ({ ...state, [groupId]: choiceId }));
    setAnnouncement(choice.feedback);
    requestAnimationFrame(() => feedbackRefs.current.get(groupId)?.focus());
  }

  function retry(groupId: string) {
    setSelectedChoices(state => {
      const next = { ...state };
      delete next[groupId];
      return next;
    });
    setAttempted(state => {
      const next = { ...state };
      delete next[groupId];
      return next;
    });
    setAnnouncement(data.retryLabel);
  }

  function resetPractice() {
    setAttempted({});
    setSolved({});
    setSelectedChoices({});
    setAttemptCount(0);
    setAnnouncement(data.resetLabel);
  }

  function runSimulation() {
    setSimulationState("complete");
    const repairedPasses = data.simulation.repairedOutput === data.simulation.expectedOutput;
    setAnnouncement(repairedPasses ? data.simulation.passedLabel : data.simulation.pendingLabel);
  }

  function resetSimulation() {
    setSimulationState("pending");
    setAnnouncement(data.simulation.resetLabel);
  }

  const artifacts = (selectedNode?.artifactIds ?? []).map(id => artifactMap.get(id)).filter((item): item is Artifact => Boolean(item));
  const initialFails = data.simulation.initialOutput !== data.simulation.expectedOutput;
  const repairedPasses = data.simulation.repairedOutput === data.simulation.expectedOutput;

  return <section className={styles.lesson} aria-labelledby={titleId}>
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
          <marker id={markerId} markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 10 5 L 0 10 Z" className={styles.arrowHead}/>
          </marker>
        </defs>
        {drawnEdges.map(edge => <path key={edge.id} d={edge.path} className={styles.connector} markerEnd={`url(#${markerId})`}/>)}
      </svg>
      {data.nodes.map((node, index) => <button
        key={node.id}
        ref={element => {
          if (element) nodeRefs.current.set(node.id, element);
          else nodeRefs.current.delete(node.id);
        }}
        type="button"
        className={styles.node}
        data-node={node.id}
        data-kind={node.kind}
        aria-pressed={selectedNode?.id === node.id}
        onClick={() => selectNode(node.id, true)}
        onKeyDown={event => handleNodeKey(event, index)}
      >
        <strong>{node.label}</strong><span>{node.heading}</span>
      </button>)}
      {drawnEdges.map(drawn => {
        const edge = data.edges.find(item => item.id === drawn.id);
        return edge?.label && drawn.labelX !== undefined && drawn.labelY !== undefined
          ? <span key={`${drawn.id}-label`} className={styles.edgeLabel} style={{ left: drawn.labelX, top: drawn.labelY }}>{edge.label}</span>
          : null;
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
        {artifacts.map(artifact => <section className={styles.artifact} key={artifact.id}>
          <p className={styles.eyebrow}>{artifact.label}</p>
          <h5>{artifact.title}</h5>
          <p className={styles.preserve}>{artifact.body}</p>
          {artifact.fields && <dl>{artifact.fields.map((field, index) => <div key={`${artifact.id}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}
        </section>)}
      </div>
    </article>

    <section className={styles.panel}>
      <h3>{data.simulation.heading}</h3>
      <p>{data.simulation.description}</p>
      <div className={styles.simulationStatus} aria-live="polite">
        {simulationState === "pending" ? <p><strong>{data.simulation.pendingLabel}</strong></p> : <>
          <p data-state={initialFails ? "failed" : "passed"}><strong>{initialFails ? data.simulation.failedLabel : data.simulation.pendingLabel}</strong></p>
          <p data-state={repairedPasses ? "passed" : "failed"}><strong>{repairedPasses ? data.simulation.passedLabel : data.simulation.pendingLabel}</strong></p>
          <p>{data.simulation.executionDisclaimer}</p>
        </>}
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={runSimulation}>{data.simulation.runLabel}</button>
        <button type="button" onClick={resetSimulation}>{data.simulation.resetLabel}</button>
      </div>
    </section>

    <section className={styles.panel} aria-labelledby={`${uid}-practice`}>
      <h3 id={`${uid}-practice`}>{data.practiceHeading}</h3>
      <p>{data.practiceInstructions}</p>
      <div className={styles.practiceGrid}>
        {data.practiceGroups.map(group => {
          const selectedId = selectedChoices[group.id];
          const choice = selectedId ? choiceMap.get(selectedId) : undefined;
          return <section className={styles.practice} key={group.id}>
            <h4>{group.title}</h4>
            <p>{group.prompt}</p>
            <fieldset>
              <legend className={styles.srOnly}>{group.title}</legend>
              {group.choiceIds.map(id => <button key={id} type="button" onClick={() => answer(group.id, id)}>{choiceMap.get(id)?.label}</button>)}
            </fieldset>
            {attempted[group.id] && choice && <div
              ref={element => {
                if (element) feedbackRefs.current.set(group.id, element);
                else feedbackRefs.current.delete(group.id);
              }}
              className={styles.feedback}
              tabIndex={-1}
            >
              <h5>{data.feedbackHeading}</h5>
              <p>{choice.feedback}</p>
              <h5>{group.solutionTitle}</h5>
              <p>{group.solution}</p>
              {!choice.correct && <button type="button" onClick={() => retry(group.id)}>{data.retryLabel}</button>}
            </div>}
          </section>;
        })}
      </div>
      <div className={styles.actions}><button type="button" onClick={resetPractice}>{data.resetLabel}</button></div>
    </section>

    <section className={styles.panel}>
      <h3>{data.takeawaysHeading}</h3>
      <ul>{data.takeaways.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
  </section>;
}

export { AgentOrchestrationLesson };
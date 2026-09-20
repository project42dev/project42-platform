"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import styles from "./OrchardLifecycleLesson.module.css";

type NodeKind = "process" | "gate" | "issue" | "terminal";
type Route = "forward" | "join" | "denyLeft" | "denyRight" | "backRight" | "holdLeft";
type NodeItem = { id: string; shortLabel: string; heading: string; description: string; kind: NodeKind; area: string; artifactIds: string[] };
type EdgeItem = { id: string; from: string; to: string; label: string; route: Route; dotted?: boolean };
type Artifact = { id: string; label: string; title: string; body: string };
type Choice = { id: string; groupId: string; label: string; correct: boolean; feedback: string };
type PracticeGroup = { id: string; title: string; prompt: string; choiceIds: string[]; solution: string };
type ExerciseAction = { id: string; label: string; success: string; blocked: string };
type HistoryMessages = Record<"initial" | "gate1Granted" | "gate1Denied" | "corrected" | "reviewPassed" | "approved" | "edited" | "merged" | "released" | "pinned" | "canaryFailed" | "canaryCorrected" | "reverified", string>;
type ExerciseContent = { heading: string; description: string; disclaimer: string; initialRevision: string; editedRevisions: string[]; expectedText: string; statusHeading: string; historyHeading: string; revisionLabel: string; gate1Label: string; reviewLabel: string; approvalLabel: string; mergeLabel: string; releaseLabel: string; pinLabel: string; liveLabel: string; holdLabel: string; noneLabel: string; grantedLabel: string; deniedLabel: string; pendingLabel: string; passLabel: string; failLabel: string; completeLabel: string; oldPinLabel: string; newPinLabel: string; notMergedLabel: string; notReleasedLabel: string; notObservedLabel: string; correctedPendingLabel: string; actions: ExerciseAction[]; resetLabel: string; completionText: string; historyMessages: HistoryMessages };
export interface OrchardLifecycleLessonContent { schemaVersion: number; id: string; title: string; category: string; summary: string; description: string; fictionNotice: string; actualStatusHeading: string; actualStatus: string[]; diagramLabel: string; textAlternativeLabel: string; textAlternative: string; nodesHeading: string; connectionsHeading: string; connectionFromLabel: string; connectionToLabel: string; connectionConditionLabel: string; unlabeledConnectionLabel: string; dottedConnectionLabel: string; walkthroughHeading: string; evidenceHeading: string; nodes: NodeItem[]; edges: EdgeItem[]; artifacts: Artifact[]; practiceHeading: string; practiceInstructions: string; feedbackHeading: string; solutionHeading: string; retryLabel: string; resetCasesLabel: string; attemptsLabel: string; completionLabel: string; pendingCompletion: string; earnedCompletion: string; practiceGroups: PracticeGroup[]; choices: Choice[]; exercise: ExerciseContent; takeawaysHeading: string; takeaways: string[] };
export interface OrchardLifecycleLessonProps { data: OrchardLifecycleLessonContent }
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type DrawnEdge = { id: string; path: string; labelX?: number; labelY?: number; dotted: boolean };
type Gate1State = "pending" | "denied" | "granted";
type ReviewState = "failed" | "pending" | "passed";
type HoldState = { revision: string; reason: string; corrected: boolean } | null;
type ExerciseState = { gate1: Gate1State; revision: string; review: ReviewState; reviewedRevision: string | null; approvedRevision: string | null; mergedRevision: string | null; releasedRevision: string | null; pinnedRevision: string | null; observedRevision: string | null; canaryAttemptRevision: string | null; hold: HoldState; history: string[]; message: string };

const centerX = (rect: Rect) => rect.left + rect.width / 2;
const centerY = (rect: Rect) => rect.top + rect.height / 2;
const fill = (template: string, revision: string) => template.replace("{revision}", revision);
function relativeBox(element: HTMLElement, host: HTMLElement): Rect { const a = element.getBoundingClientRect(); const h = host.getBoundingClientRect(); return { left: a.left - h.left, top: a.top - h.top, right: a.right - h.left, bottom: a.bottom - h.top, width: a.width, height: a.height }; }

export default function OrchardLifecycleLesson({ data }: OrchardLifecycleLessonProps) {
  const uid = useId().replace(/:/g, "");
  const markerId = `${uid}-arrow`;
  const titleId = `${uid}-title`;
  const detailId = `${uid}-detail`;
  const diagramRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const feedbackRefs = useRef(new Map<string, HTMLDivElement>());
  const [selectedNodeId, setSelectedNodeId] = useState(data.nodes[0]?.id ?? "");
  const [drawnEdges, setDrawnEdges] = useState<DrawnEdge[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({});
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const nodeMap = useMemo(() => new Map(data.nodes.map(node => [node.id, node])), [data.nodes]);
  const artifactMap = useMemo(() => new Map(data.artifacts.map(item => [item.id, item])), [data.artifacts]);
  const choiceMap = useMemo(() => new Map(data.choices.map(choice => [choice.id, choice])), [data.choices]);
  const actionMap = useMemo(() => new Map(data.exercise.actions.map(action => [action.id, action])), [data.exercise.actions]);
  const initialExercise = useCallback((): ExerciseState => ({ gate1: "pending", revision: data.exercise.initialRevision, review: "failed", reviewedRevision: data.exercise.initialRevision, approvedRevision: null, mergedRevision: null, releasedRevision: null, pinnedRevision: null, observedRevision: null, canaryAttemptRevision: null, hold: { revision: data.exercise.initialRevision, reason: "FACTUAL-BOUNDARY-ERROR", corrected: false }, history: [fill(data.exercise.historyMessages.initial, data.exercise.initialRevision)], message: data.exercise.disclaimer }), [data.exercise]);
  const [exercise, setExercise] = useState<ExerciseState>(() => initialExercise());
  const selectedNode = nodeMap.get(selectedNodeId) ?? data.nodes[0];
  const visibleArtifacts = (selectedNode?.artifactIds ?? []).map(id => artifactMap.get(id)).filter((item): item is Artifact => Boolean(item));
  const casesComplete = data.practiceGroups.length > 0 && data.practiceGroups.every(group => solved[group.id]);
  const exerciseComplete = exercise.gate1 === "granted" && exercise.reviewedRevision === exercise.revision && exercise.approvedRevision === exercise.revision && exercise.mergedRevision === exercise.revision && exercise.releasedRevision === exercise.revision && exercise.pinnedRevision === exercise.revision && exercise.observedRevision === exercise.revision && exercise.hold === null;

  const measure = useCallback(() => {
    const host = diagramRef.current;
    if (!host) return;
    const boxes = new Map<string, Rect>();
    nodeRefs.current.forEach((element, id) => boxes.set(id, relativeBox(element, host)));
    if (boxes.size !== data.nodes.length) return;
    const width = host.clientWidth;
    const first = boxes.get(data.nodes[0]?.id ?? "");
    if (!first) return;
    const leftBoundary = first.left;
    const rightBoundary = first.right;
    const rightSpace = Math.max(74, width - rightBoundary);
    const labelClearance = 36;
    const clampLabelX = (value: number) => Math.min(width - labelClearance, Math.max(labelClearance, value));
    const measuredLabel = (id: string) => {
      const element = host.querySelector<HTMLElement>(`[data-edge-label="${id}"]`);
      if (!element) return { width: 64, height: 60 };
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };
    const leftRouteEdges = data.edges.filter(edge => edge.route === "join" || edge.route === "holdLeft");
    const leftRailFor = (edge: EdgeItem, labelSize: { width: number; height: number }) => {
      const minimum = labelSize.width / 2 + 4;
      const maximum = leftBoundary - labelSize.width / 2 - 8;
      const preferred = leftBoundary * (edge.route === "join" ? .3 : .65);
      return Math.max(minimum, Math.min(maximum, preferred));
    };
    const gapBeside = (rect: Rect, downward: boolean, sourceSide: boolean) => {
      const others = [...boxes.values()].filter(candidate => candidate !== rect);
      const previousBottom = others.reduce((nearest, candidate) => candidate.bottom <= rect.top + .5 ? Math.max(nearest, candidate.bottom) : nearest, 0);
      const nextTop = others.reduce((nearest, candidate) => candidate.top >= rect.bottom - .5 ? Math.min(nearest, candidate.top) : nearest, host.clientHeight);
      if (sourceSide) return downward ? { start: rect.bottom, end: nextTop } : { start: previousBottom, end: rect.top };
      return downward ? { start: previousBottom, end: rect.top } : { start: rect.bottom, end: nextTop };
    };
    const fitCenterInGap = (value: number, gap: { start: number; end: number }, halfSize: number) => {
      const minimum = gap.start + halfSize + 4;
      const maximum = gap.end - halfSize - 4;
      return minimum <= maximum ? Math.max(minimum, Math.min(maximum, value)) : gap.start + (gap.end - gap.start) / 2;
    };
    const rightReviewRail = width - 8;
    const rightConvergenceX = rightBoundary + 10;
    const rightRails = [Math.min(width - labelClearance, rightBoundary + rightSpace * .28), Math.min(width - labelClearance, rightBoundary + rightSpace * .55), Math.min(width - labelClearance, rightBoundary + rightSpace * .82)];
    const buildLeftRoute = (edge: EdgeItem, from: Rect, to: Rect, rail: number, labelSize: { width: number; height: number }) => {
      const downward = centerY(to) >= centerY(from);
      const startX = from.left + from.width * .45;
      const startY = downward ? from.bottom : from.top;
      const sourceGap = gapBeside(from, downward, true);
      const destinationGap = gapBeside(to, downward, false);
      const siblings = leftRouteEdges.filter(candidate => {
        const siblingFrom = boxes.get(candidate.from);
        const siblingTo = boxes.get(candidate.to);
        return candidate.from === edge.from && siblingFrom && siblingTo && (centerY(siblingTo) >= centerY(siblingFrom)) === downward;
      });
      const siblingIndex = Math.max(0, siblings.findIndex(candidate => candidate.id === edge.id));
      const precedingHeight = siblings.slice(0, siblingIndex).reduce((total, candidate) => total + measuredLabel(candidate.id).height + 8, 0);
      const sourceOffset = 8 + precedingHeight + labelSize.height / 2;
      const requestedBranchY = downward ? sourceGap.start + sourceOffset : sourceGap.end - sourceOffset;
      const branchY = fitCenterInGap(requestedBranchY, sourceGap, labelSize.height / 2);
      const requestedMergeY = downward ? destinationGap.end - 16 : destinationGap.start + 16;
      const mergeY = Math.max(destinationGap.start + 8, Math.min(destinationGap.end - 8, requestedMergeY));
      const convergenceX = to.left - 10;
      return {
        path: `M ${startX} ${startY} V ${branchY} H ${rail} V ${mergeY} H ${convergenceX} V ${centerY(to)} H ${to.left}`,
        labelX: rail,
        labelY: branchY
      };
    };
    const buildRightRoute = (from: Rect, to: Rect, rail: number) => {
      const downward = centerY(to) >= centerY(from);
      const startX = from.left + from.width * .55;
      const startY = downward ? from.bottom : from.top;
      const branchY = startY + (downward ? 24 : -24);
      const mergeY = downward ? to.top - 24 : to.bottom + 24;
      return {
        path: `M ${startX} ${startY} V ${branchY} H ${rail} V ${mergeY} H ${rightConvergenceX} V ${centerY(to)} H ${to.right}`,
        labelX: (startX + rightBoundary) / 2,
        labelY: branchY
      };
    };
    const results: DrawnEdge[] = [];
    data.edges.forEach(edge => {
      const from = boxes.get(edge.from);
      const to = boxes.get(edge.to);
      if (!from || !to) return;
      let path = "";
      let labelX: number | undefined;
      let labelY: number | undefined;
      const direct = () => { const mid = from.bottom + (to.top - from.bottom) / 2; path = `M ${centerX(from)} ${from.bottom} V ${mid} H ${centerX(to)} V ${to.top}`; labelX = centerX(from); labelY = mid; };
      if (edge.route === "join") {
        const labelSize = measuredLabel(edge.id);
        const routed = buildLeftRoute(edge, from, to, leftRailFor(edge, labelSize), labelSize);
        path = routed.path;
        labelX = routed.labelX;
        labelY = routed.labelY;
      } else if (edge.id === "gate1-tracker") {
        const rail = rightRails[0];
        path = `M ${from.right} ${centerY(from)} H ${rail} V ${centerY(to)} H ${to.right}`;
        labelX = rail; labelY = centerY(from) + (centerY(to) - centerY(from)) / 2;
      } else if (edge.id === "review-gate2") {
        const routed = buildRightRoute(from, to, rightReviewRail);
        path = routed.path;
        labelX = routed.labelX;
        labelY = routed.labelY;
      } else if (edge.id === "gate2-rework") {
        const rail = rightRails[1];
        path = `M ${from.right} ${centerY(from)} H ${rail} V ${centerY(to)} H ${to.right}`;
        labelX = rail; labelY = centerY(from) + (centerY(to) - centerY(from)) / 2;
      } else if (edge.route === "backRight") {
        const rail = rightRails[2];
        path = `M ${from.right} ${centerY(from)} H ${rail} V ${centerY(to)} H ${to.right}`;
        labelX = rail; labelY = centerY(from) + (centerY(to) - centerY(from)) / 2;
      } else if (edge.route === "holdLeft") {
        const holdSize = measuredLabel(edge.id);
        const routed = buildLeftRoute(edge, from, to, leftRailFor(edge, holdSize), holdSize);
        path = routed.path;
        labelX = routed.labelX;
        labelY = routed.labelY;
      } else {
        direct();
      }
      results.push({ id: edge.id, path, labelX: edge.label && labelX !== undefined ? clampLabelX(labelX) : undefined, labelY: edge.label ? labelY : undefined, dotted: Boolean(edge.dotted) });
    });
    setDrawnEdges(results);
  }, [data.edges, data.nodes]);

  useEffect(() => {
    const host = diagramRef.current;
    if (!host) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    nodeRefs.current.forEach(node => observer.observe(node));
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); };
  }, [measure]);

  function selectNode(id: string, focusDetail: boolean) { const item = nodeMap.get(id); if (!item) return; setSelectedNodeId(id); setAnnouncement(item.heading); if (focusDetail) requestAnimationFrame(() => detailRef.current?.focus()); }
  function nodeKey(event: KeyboardEvent<HTMLButtonElement>, index: number) { let next = index; if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(data.nodes.length - 1, index + 1); else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, index - 1); else if (event.key === "Home") next = 0; else if (event.key === "End") next = data.nodes.length - 1; else return; event.preventDefault(); nodeRefs.current.get(data.nodes[next].id)?.focus(); }
  function answer(groupId: string, choiceId: string) { const choice = choiceMap.get(choiceId); if (!choice || choice.groupId !== groupId) return; setAttempts(value => value + 1); setSelectedChoices(value => ({ ...value, [groupId]: choiceId })); if (choice.correct) setSolved(value => ({ ...value, [groupId]: true })); setAnnouncement(choice.feedback); requestAnimationFrame(() => feedbackRefs.current.get(groupId)?.focus()); }
  function retry(groupId: string) { setSelectedChoices(value => { const next = { ...value }; delete next[groupId]; return next; }); setAnnouncement(data.retryLabel); }

  function runAction(id: string) {
    const action = actionMap.get(id);
    if (!action) return;
    setExercise(previous => {
      const next: ExerciseState = { ...previous, history: [...previous.history] };
      let ok = false;
      let expectedFailure = false;
      if (id === "gate1Approve" && previous.gate1 !== "granted") { next.gate1 = "granted"; next.history.push(data.exercise.historyMessages.gate1Granted); ok = true; }
      else if (id === "gate1Deny" && previous.gate1 === "pending") { next.gate1 = "denied"; next.history.push(data.exercise.historyMessages.gate1Denied); ok = true; }
      else if (id === "correct" && previous.gate1 === "granted" && previous.revision === data.exercise.initialRevision && previous.review === "failed") { const revision = data.exercise.editedRevisions[0] ?? previous.revision; Object.assign(next, { revision, review: "pending", reviewedRevision: null, approvedRevision: null, mergedRevision: null, releasedRevision: null, pinnedRevision: null, observedRevision: null, canaryAttemptRevision: null, hold: null }); next.history.push(fill(data.exercise.historyMessages.corrected, revision)); ok = true; }
      else if (id === "review" && previous.gate1 === "granted" && previous.revision !== data.exercise.initialRevision) { next.review = "passed"; next.reviewedRevision = previous.revision; next.history.push(fill(data.exercise.historyMessages.reviewPassed, previous.revision)); ok = true; }
      else if (id === "approve" && previous.review === "passed" && previous.reviewedRevision === previous.revision) { next.approvedRevision = previous.revision; next.history.push(fill(data.exercise.historyMessages.approved, previous.revision)); ok = true; }
      else if (id === "edit" && previous.approvedRevision === previous.revision && previous.revision !== (data.exercise.editedRevisions[1] ?? "")) { const revision = data.exercise.editedRevisions[1] ?? previous.revision; Object.assign(next, { revision, review: "pending", reviewedRevision: null, approvedRevision: null, mergedRevision: null, releasedRevision: null, pinnedRevision: null, observedRevision: null, canaryAttemptRevision: null, hold: null }); next.history.push(fill(data.exercise.historyMessages.edited, revision)); ok = true; }
      else if (id === "merge" && previous.approvedRevision === previous.revision) { next.mergedRevision = previous.revision; next.history.push(fill(data.exercise.historyMessages.merged, previous.revision)); ok = true; }
      else if (id === "release" && previous.mergedRevision === previous.revision) { next.releasedRevision = previous.revision; next.history.push(fill(data.exercise.historyMessages.released, previous.revision)); ok = true; }
      else if (id === "pin" && previous.releasedRevision === previous.revision) { next.pinnedRevision = previous.revision; next.history.push(fill(data.exercise.historyMessages.pinned, previous.revision)); ok = true; }
      else if (id === "verify" && previous.pinnedRevision === previous.revision && previous.canaryAttemptRevision !== previous.revision) { next.canaryAttemptRevision = previous.revision; next.hold = { revision: previous.revision, reason: "OLD-SITE-PIN-CACHE", corrected: false }; next.history.push(fill(data.exercise.historyMessages.canaryFailed, previous.revision)); expectedFailure = true; }
      else if (id === "fixCanary" && previous.hold?.revision === previous.revision && previous.hold.reason === "OLD-SITE-PIN-CACHE" && !previous.hold.corrected) { next.hold = { ...previous.hold, corrected: true }; next.history.push(fill(data.exercise.historyMessages.canaryCorrected, previous.revision)); ok = true; }
      else if (id === "verify" && previous.pinnedRevision === previous.revision && previous.hold?.revision === previous.revision && previous.hold.reason === "OLD-SITE-PIN-CACHE" && previous.hold.corrected) { next.observedRevision = previous.revision; next.hold = null; next.history.push(fill(data.exercise.historyMessages.reverified, previous.revision)); ok = true; }
      next.message = ok ? action.success : action.blocked;
      if (expectedFailure) next.message = action.blocked;
      setAnnouncement(next.message);
      return next;
    });
  }

  return <section className={styles.lesson} aria-labelledby={titleId}>
    <p className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</p>
    <header className={styles.panel}><p className={styles.eyebrow}>{data.category}</p><h2 id={titleId}>{data.title}</h2><p>{data.summary}</p><p>{data.description}</p><p className={styles.notice}>{data.fictionNotice}</p></header>
    <section className={styles.panel}><h3>{data.actualStatusHeading}</h3><ul>{data.actualStatus.map(item => <li key={item}>{item}</li>)}</ul></section>
    <section className={styles.panel}><h3>{data.nodesHeading}</h3><div ref={diagramRef} className={styles.diagram} role="group" aria-label={data.diagramLabel}>
      <svg className={styles.connectors} aria-hidden="true"><defs><marker id={markerId} markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 Z" className={styles.arrowHead}/></marker></defs>{drawnEdges.map(edge => <path key={edge.id} data-edge-id={edge.id} d={edge.path} className={`${styles.connector} ${edge.dotted ? styles.dotted : ""}`} markerEnd={`url(#${markerId})`}/>)}</svg>
      {data.nodes.map((node, index) => <button id={`${uid}-node-${node.id}`} key={node.id} ref={element => { if (element) nodeRefs.current.set(node.id, element); else nodeRefs.current.delete(node.id); }} type="button" className={styles.node} data-kind={node.kind} data-node-id={node.id} aria-pressed={selectedNode?.id === node.id} onClick={() => selectNode(node.id, true)} onKeyDown={event => nodeKey(event, index)}><strong>{node.shortLabel}</strong><span>{node.heading}</span></button>)}
      {drawnEdges.map(drawn => { const edge = data.edges.find(item => item.id === drawn.id); return edge?.label && drawn.labelX !== undefined && drawn.labelY !== undefined ? <span key={`${drawn.id}-label`} data-edge-label={drawn.id} className={styles.edgeLabel} style={{ left: drawn.labelX, top: drawn.labelY }}>{edge.label}</span> : null; })}
    </div></section>
    <details className={styles.panel}><summary>{data.textAlternativeLabel}</summary><p>{data.textAlternative}</p><h3>{data.connectionsHeading}</h3><ol className={styles.edgeList}>{data.edges.map(edge => <li key={edge.id}><span>{data.connectionFromLabel}: {nodeMap.get(edge.from)?.shortLabel ?? edge.from}. </span><span>{data.connectionConditionLabel}: {edge.label || data.unlabeledConnectionLabel}. </span><span>{data.connectionToLabel}: {nodeMap.get(edge.to)?.shortLabel ?? edge.to}.</span>{edge.dotted ? <span> {data.dottedConnectionLabel}.</span> : null}</li>)}</ol></details>
    <article className={styles.panel} aria-labelledby={detailId}><p className={styles.eyebrow}>{data.walkthroughHeading}: {selectedNode?.shortLabel}</p><h3 id={detailId} ref={detailRef} tabIndex={-1}>{selectedNode?.heading}</h3><p>{selectedNode?.description}</p><h4>{data.evidenceHeading}</h4><div className={styles.cards}>{visibleArtifacts.map(item => <section className={styles.artifact} key={item.id}><p className={styles.eyebrow}>{item.label}</p><h5>{item.title}</h5><p className={styles.preserve}>{item.body}</p></section>)}</div></article>
    <section className={styles.panel}><h3>{data.exercise.heading}</h3><p>{data.exercise.description}</p><p className={styles.notice}>{data.exercise.disclaimer}</p><h4>{data.exercise.statusHeading}</h4><dl className={styles.stateList}><div><dt>{data.exercise.gate1Label}</dt><dd>{exercise.gate1 === "granted" ? data.exercise.grantedLabel : exercise.gate1 === "denied" ? data.exercise.deniedLabel : data.exercise.pendingLabel}</dd></div><div><dt>{data.exercise.revisionLabel}</dt><dd>{exercise.revision}</dd></div><div><dt>{data.exercise.reviewLabel}</dt><dd>{exercise.review === "passed" ? `${data.exercise.passLabel}: ${exercise.reviewedRevision}` : exercise.review === "failed" ? data.exercise.failLabel : data.exercise.pendingLabel}</dd></div><div><dt>{data.exercise.approvalLabel}</dt><dd>{exercise.approvedRevision ?? data.exercise.noneLabel}</dd></div><div><dt>{data.exercise.mergeLabel}</dt><dd>{exercise.mergedRevision ?? data.exercise.notMergedLabel}</dd></div><div><dt>{data.exercise.releaseLabel}</dt><dd>{exercise.releasedRevision ?? data.exercise.notReleasedLabel}</dd></div><div><dt>{data.exercise.pinLabel}</dt><dd>{exercise.pinnedRevision === exercise.revision ? `${data.exercise.newPinLabel}: ${exercise.pinnedRevision}` : data.exercise.oldPinLabel}</dd></div><div><dt>{data.exercise.liveLabel}</dt><dd>{exercise.observedRevision === exercise.revision ? `${data.exercise.completeLabel}: ${exercise.observedRevision}` : data.exercise.notObservedLabel}</dd></div><div><dt>{data.exercise.holdLabel}</dt><dd>{exercise.hold ? `${exercise.hold.reason} (${exercise.hold.revision}${exercise.hold.corrected ? `, ${data.exercise.correctedPendingLabel}` : ""})` : data.exercise.noneLabel}</dd></div></dl><p className={styles.exerciseMessage} aria-live="polite">{exercise.message}</p><div className={styles.actions}>{data.exercise.actions.map(action => <button type="button" key={action.id} onClick={() => runAction(action.id)}>{action.label}</button>)}<button type="button" onClick={() => { setExercise(initialExercise()); setAnnouncement(data.exercise.resetLabel); }}>{data.exercise.resetLabel}</button></div><h4>{data.exercise.historyHeading}</h4><ol className={styles.history}>{exercise.history.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol><p data-complete={exerciseComplete}>{data.exercise.completionText}</p></section>
    <section className={styles.panel}><div className={styles.status} aria-label={data.completionLabel}><span><strong>{data.attemptsLabel}:</strong> {attempts}</span><span><strong>{data.completionLabel}:</strong> {casesComplete ? data.earnedCompletion : data.pendingCompletion}</span></div><h3>{data.practiceHeading}</h3><p>{data.practiceInstructions}</p><div className={styles.practiceGrid}>{data.practiceGroups.map(group => { const selectedId = selectedChoices[group.id]; const choice = selectedId ? choiceMap.get(selectedId) : undefined; return <section className={styles.practice} key={group.id}><h4>{group.title}</h4><p>{group.prompt}</p><div className={styles.choiceList}>{group.choiceIds.map(id => <button type="button" key={id} onClick={() => answer(group.id, id)}>{choiceMap.get(id)?.label}</button>)}</div>{choice && <div ref={element => { if (element) feedbackRefs.current.set(group.id, element); else feedbackRefs.current.delete(group.id); }} className={styles.feedback} tabIndex={-1}><h5>{data.feedbackHeading}</h5><p>{choice.feedback}</p><h5>{data.solutionHeading}</h5><p>{group.solution}</p>{!choice.correct && <button type="button" onClick={() => retry(group.id)}>{data.retryLabel}</button>}</div>}</section>; })}</div><div className={styles.actions}><button type="button" onClick={() => { setAttempts(0); setSelectedChoices({}); setSolved({}); setAnnouncement(data.resetCasesLabel); }}>{data.resetCasesLabel}</button></div></section>
    <section className={styles.panel}><h3>{data.takeawaysHeading}</h3><ul>{data.takeaways.map(item => <li key={item}>{item}</li>)}</ul></section>
  </section>;
}

export { OrchardLifecycleLesson };
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./LearningEvidenceLesson.module.css";

export type LearningEvidenceNodeKind =
  | "learn"
  | "practice"
  | "check"
  | "feedback"
  | "retry"
  | "transcript"
  | "path"
  | "badge";

export interface LearningEvidenceAction {
  label: string;
  targetNodeId: string;
}

export interface LearningEvidenceNode {
  id: string;
  kind: LearningEvidenceNodeKind;
  label: string;
  heading: string;
  description: string;
  artifactIds: string[];
  choiceIds?: string[];
  action?: LearningEvidenceAction;
}

export interface LearningEvidenceLink {
  id: string;
  from: string;
  to: string;
  label: string;
  condition?: "incorrect" | "correct" | "allCriteriaComplete";
}

export interface LearningEvidenceField {
  label: string;
  value: string;
}

export interface LearningEvidenceArtifact {
  id: string;
  type: "source" | "answer" | "feedback" | "path-summary";
  label: string;
  title: string;
  body: string;
  attribution?: string;
  sourceMetadata?: {
    kind: string;
    creator: string;
    title: string;
    url: string | null;
  };
  fields?: LearningEvidenceField[];
}

export interface LearningEvidenceChoice {
  id: string;
  label: string;
  correct: boolean;
  feedback: string;
  nextNodeId: string;
}

export interface LearningEvidenceCriterion {
  id: string;
  label: string;
  moduleId: string;
  status: "completed" | "pending";
  suppliedAsSeparateDemo: boolean;
}

export interface LearningEvidenceRecordCopy {
  label: string;
  title: string;
  body: string;
  statusLabel?: string;
  statusValue?: string;
  recordIdLabel?: string;
  recordIdValue?: string;
  moduleLabel?: string;
  moduleValue?: string;
  evidenceLabel: string;
  evidenceValue: string;
  resultLabel?: string;
  resultValue?: string;
  persistenceLabel?: string;
  persistenceValue?: string;
}

export interface LearningEvidenceLessonContent {
  schemaVersion: number;
  id: string;
  title: string;
  category: string;
  summary: string;
  description: string;
  altText: string;
  caption: string;
  takeaways: string[];
  startNodeId: string;
  navigationLabel: string;
  progressLabel: string;
  safetyNotice: string;
  resetLabel: string;
  feedbackLabel: string;
  attemptsLabel: string;
  latestResultLabel: string;
  noAttemptsValue: string;
  correctResultValue: string;
  pendingRecord: LearningEvidenceRecordCopy;
  earnedRecord: LearningEvidenceRecordCopy;
  nodes: LearningEvidenceNode[];
  links: LearningEvidenceLink[];
  artifacts: LearningEvidenceArtifact[];
  choices: LearningEvidenceChoice[];
  path: {
    id: string;
    label: string;
    badgeLabel: string;
    pendingBadgeLabel: string;
    criterionCompleteLabel: string;
    criterionPendingLabel: string;
    separateDemoLabel: string;
    criteria: LearningEvidenceCriterion[];
    completeMessage: string;
    incompleteMessage: string;
  };
}

export interface LearningEvidenceLessonProps {
  data: LearningEvidenceLessonContent;
}

type NavigationIntent = {
  token: number;
  announcement: string;
};

export function LearningEvidenceLesson({ data }: LearningEvidenceLessonProps) {
  const instanceId = useId().replace(/:/g, "");
  const lessonHeadingId = `${instanceId}-lesson-heading`;
  const pathStatusId = `${instanceId}-path-status`;
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const navigationTokenRef = useRef(0);
  const [currentNodeId, setCurrentNodeId] = useState(data.startNodeId);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [moduleComplete, setModuleComplete] = useState(false);
  const [navigationIntent, setNavigationIntent] = useState<NavigationIntent | null>(null);
  const [announcement, setAnnouncement] = useState("");

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

  const currentNode = nodesById.get(currentNodeId) ?? data.nodes[0];
  const selectedChoice = selectedChoiceId
    ? choicesById.get(selectedChoiceId) ?? null
    : null;
  const currentIndex = Math.max(
    0,
    data.nodes.findIndex((node) => node.id === currentNode.id),
  );
  const detailHeadingId = `${instanceId}-${currentNode.id}-heading`;
  const effectiveCriteria = data.path.criteria.map((criterion) => ({
    ...criterion,
    complete:
      criterion.moduleId === data.id
        ? moduleComplete
        : criterion.status === "completed",
  }));
  const pathComplete = effectiveCriteria.every((criterion) => criterion.complete);

  useEffect(() => {
    if (!navigationIntent) return;
    detailHeadingRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- announce focus-driven lesson navigation to assistive technology
    setAnnouncement(navigationIntent.announcement);
  }, [navigationIntent]);

  function navigate(nodeId: string, status: string) {
    if (!nodesById.has(nodeId)) return;
    navigationTokenRef.current += 1;
    setCurrentNodeId(nodeId);
    setNavigationIntent({
      token: navigationTokenRef.current,
      announcement: status,
    });
  }

  function goToNode(nodeId: string) {
    const node = nodesById.get(nodeId);
    if (node) navigate(nodeId, node.label);
  }

  function chooseAnswer(choice: LearningEvidenceChoice) {
    const destination = nodesById.get(choice.nextNodeId);
    setSelectedChoiceId(choice.id);
    setAttemptCount((count) => count + 1);
    if (choice.correct) setModuleComplete(true);
    navigate(choice.nextNodeId, `${destination?.label ?? choice.nextNodeId}. ${choice.feedback}`);
  }

  function resetDemo() {
    const startNode = nodesById.get(data.startNodeId);
    setSelectedChoiceId(null);
    setAttemptCount(0);
    setModuleComplete(false);
    navigate(data.startNodeId, `${data.resetLabel}. ${startNode?.label ?? data.startNodeId}`);
  }

  const latestResult = selectedChoice
    ? selectedChoice.correct
      ? data.correctResultValue
      : selectedChoice.feedback
    : data.noAttemptsValue;

  const recordFields: LearningEvidenceField[] = moduleComplete
    ? [
        { label: data.earnedRecord.recordIdLabel!, value: data.earnedRecord.recordIdValue! },
        { label: data.earnedRecord.moduleLabel!, value: data.earnedRecord.moduleValue! },
        { label: data.earnedRecord.evidenceLabel, value: data.earnedRecord.evidenceValue },
        { label: data.earnedRecord.resultLabel!, value: data.earnedRecord.resultValue! },
        { label: data.attemptsLabel, value: String(attemptCount) },
        { label: data.latestResultLabel, value: latestResult },
        { label: data.earnedRecord.persistenceLabel!, value: data.earnedRecord.persistenceValue! },
      ]
    : [
        { label: data.pendingRecord.statusLabel!, value: data.pendingRecord.statusValue! },
        { label: data.pendingRecord.evidenceLabel, value: data.pendingRecord.evidenceValue },
        { label: data.attemptsLabel, value: String(attemptCount) },
        { label: data.latestResultLabel, value: latestResult },
      ];
  const recordCopy = moduleComplete ? data.earnedRecord : data.pendingRecord;

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

      <div className={styles.progressBlock}>
        <div className={styles.progressText}>
          <span>
            <strong>{data.progressLabel}</strong>: {currentNode.label}
          </span>
          <span>
            {currentIndex + 1} of {data.nodes.length}
          </span>
        </div>
        <progress
          aria-label={data.progressLabel}
          max={data.nodes.length}
          value={currentIndex + 1}
        />
      </div>

      <nav className={styles.flow} aria-label={data.navigationLabel}>
        <ol className={styles.nodeList}>
          {data.nodes.map((node, index) => {
            const outgoing = data.links.filter((link) => link.from === node.id);
            const isCurrent = node.id === currentNode.id;
            return (
              <li className={styles.nodeItem} key={node.id}>
                <button
                  aria-pressed={isCurrent}
                  className={styles.nodeButton}
                  data-kind={node.kind}
                  onClick={() => goToNode(node.id)}
                  type="button"
                >
                  <span className={styles.nodeNumber}>{index + 1}</span>
                  <span>
                    <strong>{node.label}</strong>
                    <small>{node.heading}</small>
                  </span>
                </button>
                {outgoing.length > 0 && (
                  <ul className={styles.links} aria-label={`Routes from ${node.label}`}>
                    {outgoing.map((link) => (
                      <li key={link.id}>
                        <span aria-hidden="true">→</span>{" "}
                        {link.label}: {nodesById.get(link.to)?.label ?? link.to}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <article className={styles.detail} aria-labelledby={detailHeadingId}>
        <header className={styles.detailHeader}>
          <p className={styles.stageLabel}>{currentNode.label}</p>
          <h3 id={detailHeadingId} ref={detailHeadingRef} tabIndex={-1}>
            {currentNode.heading}
          </h3>
          <p>{currentNode.description}</p>
        </header>

        {currentNode.artifactIds.length > 0 && (
          <div className={styles.artifacts}>
            {currentNode.artifactIds.map((artifactId) => {
              const artifact = artifactsById.get(artifactId);
              if (!artifact) return null;
              return (
                <section className={styles.artifact} key={artifact.id}>
                  <p className={styles.artifactLabel}>{artifact.label}</p>
                  <h4>{artifact.title}</h4>
                  {artifact.type === "source" || artifact.type === "answer" ? (
                    <blockquote>{artifact.body}</blockquote>
                  ) : (
                    <p>{artifact.body}</p>
                  )}
                  {artifact.fields && (
                    <dl className={styles.fields}>
                      {artifact.fields.map((field) => (
                        <div key={`${artifact.id}-${field.label}-${field.value}`}>
                          <dt>{field.label}</dt>
                          <dd>{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {artifact.attribution && (
                    <p className={styles.attribution}>{artifact.attribution}</p>
                  )}
                  {artifact.sourceMetadata && (
                    <dl className={styles.sourceMetadata}>
                      <div>
                        <dt>Source type</dt>
                        <dd>{artifact.sourceMetadata.kind}</dd>
                      </div>
                      <div>
                        <dt>Creator</dt>
                        <dd>{artifact.sourceMetadata.creator}</dd>
                      </div>
                      <div>
                        <dt>Source title</dt>
                        <dd>{artifact.sourceMetadata.title}</dd>
                      </div>
                    </dl>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {currentNode.kind === "transcript" && (
          <section className={styles.artifact} aria-label={recordCopy.label}>
            <p className={styles.artifactLabel}>{recordCopy.label}</p>
            <h4>{recordCopy.title}</h4>
            <p>{recordCopy.body}</p>
            <dl className={styles.fields}>
              {recordFields.map((field) => (
                <div key={`${field.label}-${field.value}`}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {currentNode.choiceIds && (
          <fieldset className={styles.choices}>
            <legend>{currentNode.heading}</legend>
            {currentNode.choiceIds.map((choiceId) => {
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
        )}

        {selectedChoice &&
          ((currentNode.kind === "feedback" && !selectedChoice.correct) ||
            (currentNode.kind === "transcript" && selectedChoice.correct)) && (
            <div className={styles.feedback}>
              <strong>{data.feedbackLabel}</strong>
              <p>{selectedChoice.feedback}</p>
            </div>
          )}

        {(currentNode.kind === "path" || currentNode.kind === "badge") && (
          <section className={styles.pathStatus} aria-labelledby={pathStatusId}>
            <h4 id={pathStatusId}>{data.path.label}</h4>
            <ul>
              {effectiveCriteria.map((criterion) => (
                <li key={criterion.id}>
                  <strong>
                    {criterion.complete
                      ? data.path.criterionCompleteLabel
                      : data.path.criterionPendingLabel}
                  </strong>
                  <span>{criterion.label}</span>
                  {criterion.suppliedAsSeparateDemo && (
                    <small>{data.path.separateDemoLabel}</small>
                  )}
                </li>
              ))}
            </ul>
            <p className={styles.badgeResult}>
              <strong>
                {pathComplete ? data.path.badgeLabel : data.path.pendingBadgeLabel}
              </strong>
              <span>
                {pathComplete
                  ? data.path.completeMessage
                  : data.path.incompleteMessage}
              </span>
            </p>
          </section>
        )}

        {currentNode.action && (
          <button
            className={styles.primaryAction}
            onClick={() => goToNode(currentNode.action!.targetNodeId)}
            type="button"
          >
            {currentNode.action.label}
          </button>
        )}
      </article>

      <div className={styles.footerActions}>
        <button onClick={resetDemo} type="button">
          {data.resetLabel}
        </button>
      </div>
    </section>
  );
}

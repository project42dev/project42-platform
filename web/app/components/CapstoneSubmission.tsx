"use client";

import type { CapstoneDefinition } from "@project42/platform";
import { useMemo, useState, type FormEvent } from "react";
import { useProgress } from "./ProgressProvider";

interface CapstoneSubmissionProps {
  capstone: CapstoneDefinition;
  moduleId: string;
  pathId: string;
}

export function CapstoneSubmission({
  capstone,
  moduleId,
  pathId,
}: CapstoneSubmissionProps) {
  const { progress, recordCapstone } = useProgress();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [artifactRefs, setArtifactRefs] = useState(() =>
    capstone.requiredArtifacts.map(() => ""),
  );
  const [evidenceSelections, setEvidenceSelections] = useState<
    Record<string, string[]>
  >({});
  const submissions = useMemo(
    () =>
      (progress.capstoneSubmissions ?? [])
        .filter((submission) => submission.moduleId === moduleId)
        .slice()
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)),
    [moduleId, progress.capstoneSubmissions],
  );
  const latest = submissions[0];
  const knowledgeCheckPassed = progress.attempts.some(
    (attempt) => attempt.moduleId === moduleId && attempt.passed,
  );
  const completed = progress.completedModuleIds.includes(moduleId);
  const assessmentEvidence = progress.attempts
    .filter((attempt) => attempt.pathId === pathId && attempt.moduleId === moduleId)
    .map((attempt) => ({
      label: `Knowledge check · ${attempt.scorePercent}% · ${attempt.passed ? "passed" : "not passed"}`,
      value: `assessment:${attempt.id}`,
    }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const criterionScores = capstone.rubric.criteria.map((criterion) => {
      const rawPoints = String(
        form.get(`criterion-${criterion.id}`) ?? "",
      ).trim();
      return {
        criterionId: criterion.id,
        pointsAwarded: rawPoints ? Number(rawPoints) : Number.NaN,
        ...(capstone.requiresCriterionEvidence
          ? {
            evidenceRefs: (evidenceSelections[criterion.id] ?? []).map(
              (selection) =>
                selection.startsWith("artifact:")
                  ? artifactRefs[Number(selection.slice("artifact:".length))]
                  : selection,
            ),
          }
          : {}),
      };
    });
    const reflection = String(form.get("reflection") ?? "").trim();
    if (
      artifactRefs.some((reference) => !reference) ||
      !reflection ||
      criterionScores.some((score, index) => {
        const criterion = capstone.rubric.criteria[index];
        return (
          !Number.isInteger(score.pointsAwarded) ||
          score.pointsAwarded < 0 ||
          score.pointsAwarded > criterion.maxPoints
        );
      }) ||
      (capstone.requiresCriterionEvidence &&
        criterionScores.some(
          (score) =>
            !score.evidenceRefs?.length ||
            score.evidenceRefs.some((reference) => !reference),
        ))
    ) {
      setFormError(
        "Complete every artifact, enter whole rubric points within each limit, map evidence to every criterion, and add the reflection.",
      );
      return;
    }
    try {
      recordCapstone(pathId, moduleId, artifactRefs, criterionScores, reflection);
      setFormError("");
      setSubmitted(true);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? `The evidence could not be saved: ${error.message}`
          : "The evidence could not be saved. Review every field and try again.",
      );
    }
  };

  return (
    <section
      className="capstone-submission"
      id="capstone-evidence"
      aria-labelledby={`${capstone.id}-title`}
    >
      <div className="capstone-heading">
        <div>
          <p className="eyebrow">Applied capstone</p>
          <h2 id={`${capstone.id}-title`}>{capstone.title}</h2>
        </div>
        <span className="capstone-threshold">
          Pass at {capstone.rubric.passPercent}%
        </span>
      </div>
      <p>{capstone.summary}</p>
      <aside className="capstone-review-note">
        <strong>Practice release: evidence-backed self-review</strong>
        <p>
          Score only work you can point to in the submitted artifacts. Keep secrets
          and unnecessary personal information out of references. A future
          organization-hosted release can require a separate reviewer.
        </p>
      </aside>

      {capstone.exemplars?.length ? (
        <section
          className="capstone-exemplars"
          aria-labelledby={`${capstone.id}-exemplars-title`}
        >
          <p className="eyebrow">Calibration examples</p>
          <h3 id={`${capstone.id}-exemplars-title`}>
            Compare evidence before you score
          </h3>
          <p>
            Review both packages. The difference is the quality of operational
            evidence, not the confidence of the writing.
          </p>
          <div className="capstone-exemplar-grid">
            {capstone.exemplars.map((exemplar) => (
              <details
                className={`capstone-exemplar capstone-exemplar-${exemplar.kind}`}
                key={exemplar.id}
              >
                <summary>
                  <span>
                    {exemplar.kind === "complete" ? "Complete" : "Deliberately flawed"}
                  </span>
                  <strong>{exemplar.title}</strong>
                  <small>
                    Calibration: {exemplar.expectedScorePercent}% ·{" "}
                    {exemplar.expectedPassed ? "passes" : "does not pass"}
                  </small>
                </summary>
                <p>{exemplar.summary}</p>
                <div className="exemplar-artifacts">
                  {exemplar.artifacts.map((artifact) => (
                    <article key={artifact.ref}>
                      <h4>{artifact.label}</h4>
                      <p>{artifact.content}</p>
                      <code>{artifact.ref}</code>
                    </article>
                  ))}
                </div>
                <h4>Reviewer calibration</h4>
                <ul className="exemplar-score-list">
                  {exemplar.criterionScores.map((score) => {
                    const criterion = capstone.rubric.criteria.find(
                      (candidate) => candidate.id === score.criterionId,
                    );
                    return (
                      <li key={score.criterionId}>
                        <strong>
                          {criterion?.title ?? score.criterionId}:{" "}
                          {score.pointsAwarded}/{criterion?.maxPoints ?? "?"}
                        </strong>
                        <span>{score.reviewerNote}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <form onSubmit={submit}>
        <fieldset className="capstone-artifacts">
          <legend>Required artifacts</legend>
          <p>Provide a path, URL, or short stable reference for every artifact.</p>
          {capstone.requiredArtifacts.map((artifact, index) => (
            <label key={artifact} htmlFor={`${capstone.id}-artifact-${index}`}>
              <span>
                {index + 1}. {artifact}
              </span>
              <input
                id={`${capstone.id}-artifact-${index}`}
                name={`artifact-${index}`}
                onChange={(event) => {
                  const value = event.currentTarget.value.trim();
                  setArtifactRefs((current) =>
                    current.map((reference, artifactIndex) =>
                      artifactIndex === index
                        ? value
                        : reference,
                    ),
                  );
                }}
                placeholder="Example: portfolio/verification.md"
                required
                value={artifactRefs[index]}
              />
            </label>
          ))}
        </fieldset>

        <fieldset className="capstone-rubric">
          <legend>Evidence rubric</legend>
          <p>
            Award whole points from 0 to the criterion maximum. The total is checked
            against the published rubric.
          </p>
          {capstone.rubric.criteria.map((criterion) => {
            const helpId = `${capstone.id}-${criterion.id}-help`;
            return (
              <div className="rubric-row" key={criterion.id}>
                <div>
                  <h3>{criterion.title}</h3>
                  <p>{criterion.description}</p>
                  <div id={helpId}>
                    <strong>Evidence required</strong>
                    <ul>
                      {criterion.evidenceRequired.map((evidence) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <label htmlFor={`${capstone.id}-${criterion.id}-score`}>
                  <span>Points</span>
                  <input
                    aria-describedby={helpId}
                    id={`${capstone.id}-${criterion.id}-score`}
                    max={criterion.maxPoints}
                    min={0}
                    name={`criterion-${criterion.id}`}
                    required
                    type="number"
                  />
                  <small>of {criterion.maxPoints}</small>
                </label>
                {capstone.requiresCriterionEvidence ? (
                  <fieldset className="criterion-evidence-map">
                    <legend>Map this score to evidence</legend>
                    <p>
                      Choose one or more submitted artifacts or a recorded knowledge
                      check.
                    </p>
                    <div>
                      {capstone.requiredArtifacts.map((artifact, index) => {
                        const selection = `artifact:${index}`;
                        const checked = (
                          evidenceSelections[criterion.id] ?? []
                        ).includes(selection);
                        return (
                          <label
                            key={selection}
                            title={artifactRefs[index] || artifact}
                          >
                            <input
                              checked={checked}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setEvidenceSelections((current) => {
                                  const selected = current[criterion.id] ?? [];
                                  return {
                                    ...current,
                                    [criterion.id]: checked
                                      ? [...selected, selection]
                                      : selected.filter(
                                        (item) => item !== selection,
                                      ),
                                  };
                                });
                              }}
                              type="checkbox"
                            />
                            <span>
                              Artifact {index + 1}:{" "}
                              {artifactRefs[index] || artifact}
                            </span>
                          </label>
                        );
                      })}
                      {assessmentEvidence.map((evidence) => {
                        const checked = (
                          evidenceSelections[criterion.id] ?? []
                        ).includes(evidence.value);
                        return (
                          <label key={evidence.value}>
                            <input
                              checked={checked}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setEvidenceSelections((current) => {
                                  const selected = current[criterion.id] ?? [];
                                  return {
                                    ...current,
                                    [criterion.id]: checked
                                      ? [...selected, evidence.value]
                                      : selected.filter(
                                        (item) => item !== evidence.value,
                                      ),
                                  };
                                });
                              }}
                              type="checkbox"
                            />
                            <span>{evidence.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        <label className="capstone-reflection" htmlFor={`${capstone.id}-reflection`}>
          <span>Reflection and handoff</span>
          <textarea
            id={`${capstone.id}-reflection`}
            name="reflection"
            placeholder="What changed, what evidence justified it, what remains uncertain, and what would you improve?"
            required
            rows={6}
          />
        </label>

        <button className="button button-primary" type="submit">
          Score and save capstone evidence
        </button>
        {formError ? (
          <p className="capstone-form-error" role="alert">
            {formError}
          </p>
        ) : null}
      </form>

      {latest ? (
        <div
          className={`capstone-result ${latest.passed ? "capstone-result-pass" : "capstone-result-retry"
            }`}
          role="status"
        >
          <strong>
            Latest capstone: {latest.scorePercent}% ·{" "}
            {latest.passed ? "rubric passed" : "revise and resubmit"}
          </strong>
          <p>
            {completed
              ? "Capstone and knowledge check complete. This module is saved to your transcript."
              : latest.passed && !knowledgeCheckPassed
                ? "Your evidence passed. Complete the knowledge check below to finish the module."
                : "Use the rubric feedback to improve the artifacts, then submit a new evidence record."}
          </p>
          {submitted ? <small>Saved to your account.</small> : null}
          <details className="capstone-latest-evidence">
            <summary>View criterion evidence for this submission</summary>
            <ul>
              {latest.criterionScores.map((score) => {
                const criterion = capstone.rubric.criteria.find(
                  (candidate) => candidate.id === score.criterionId,
                );
                return (
                  <li key={score.criterionId}>
                    <strong>
                      {criterion?.title ?? score.criterionId}: {score.pointsAwarded}/
                      {criterion?.maxPoints ?? "?"}
                    </strong>
                    <span>
                      {(score.evidenceRefs ?? []).length
                        ? score.evidenceRefs?.join(" · ")
                        : "Evidence mapping was not required for this capstone."}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      ) : null}
    </section>
  );
}

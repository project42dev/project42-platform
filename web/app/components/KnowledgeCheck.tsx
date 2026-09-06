"use client";

import { scoreKnowledgeCheck, type KnowledgeQuestion } from "@project42/platform";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useProgress } from "./ProgressProvider";

interface KnowledgeCheckProps {
  pathId: string;
  moduleId: string;
  passPercent: number;
  questions: KnowledgeQuestion[];
  nextHref?: string;
  requiresCapstone?: boolean;
}

export function KnowledgeCheck({
  pathId,
  moduleId,
  passPercent,
  questions,
  nextHref,
  requiresCapstone = false,
}: KnowledgeCheckProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const { recordResult, progress } = useProgress();
  const result = useMemo(
    () => scoreKnowledgeCheck(questions, answers, passPercent),
    [answers, passPercent, questions],
  );
  const completed = progress.completedModuleIds.includes(moduleId);

  const submit = () => {
    setSubmitted(true);
    recordResult(pathId, moduleId, result);
  };

  const retry = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <section className="knowledge-check" aria-labelledby="knowledge-check-title">
      <div className="check-heading">
        <div>
          <p className="eyebrow">Knowledge check</p>
          <h2 id="knowledge-check-title">Make it stick.</h2>
        </div>
        <span className="pass-note">Pass at {passPercent}%</span>
      </div>
      <p>
        Choose the strongest answer for each question. Your attempts become part of
        your account transcript.
      </p>
      <div className="question-list">
        {questions.map((question, questionIndex) => {
          const feedback = result.feedback.find((item) => item.questionId === question.id);
          return (
            <fieldset className="question-card" key={question.id}>
              <legend>
                <span>{String(questionIndex + 1).padStart(2, "0")}</span>
                {question.prompt}
              </legend>
              {question.choices.map((choice, choiceIndex) => {
                const checked = answers[question.id] === choiceIndex;
                const isCorrect = submitted && choiceIndex === question.answerIndex;
                const isWrong = submitted && checked && !isCorrect;
                return (
                  <label
                    className={[
                      "answer-choice",
                      isCorrect ? "answer-correct" : "",
                      isWrong ? "answer-wrong" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={choice}
                  >
                    <input
                      checked={checked}
                      disabled={submitted}
                      name={question.id}
                      onChange={() =>
                        setAnswers((current) => ({ ...current, [question.id]: choiceIndex }))
                      }
                      type="radio"
                      value={choiceIndex}
                    />
                    <span className="answer-marker">{String.fromCharCode(65 + choiceIndex)}</span>
                    <span>{choice}</span>
                  </label>
                );
              })}
              {submitted && feedback ? (
                <p className={`answer-explanation ${feedback.correct ? "is-correct" : ""}`}>
                  <strong>{feedback.correct ? "Correct." : "Review this one."}</strong>{" "}
                  {feedback.explanation}
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      {!submitted ? (
        <button
          className="button button-primary"
          disabled={Object.keys(answers).length !== questions.length}
          onClick={submit}
          type="button"
        >
          Check my answers
        </button>
      ) : (
        <div className={`check-result ${result.passed ? "result-pass" : "result-retry"}`} role="status">
          <div>
            <span>{result.scorePercent}%</span>
            <div>
              <strong>{result.passed ? "Checkpoint passed" : "Not quite yet"}</strong>
              <p>
                {result.correct} of {result.total} correct
                {completed
                  ? " · Saved to your transcript"
                  : result.passed && requiresCapstone
                    ? " · Capstone evidence is also required"
                    : ""}
              </p>
            </div>
          </div>
          <div className="button-row">
            {!result.passed ? (
              <button className="button button-secondary" onClick={retry} type="button">
                Try again
              </button>
            ) : null}
            {result.passed && nextHref ? (
              <Link className="button button-primary" href={nextHref}>
                Continue
              </Link>
            ) : null}
            {result.passed && requiresCapstone && !completed ? (
              <a className="button button-primary" href="#capstone-evidence">
                Complete capstone evidence
              </a>
            ) : null}
            {result.passed && !nextHref && (!requiresCapstone || completed) ? (
              <Link className="button button-primary" href="/profile">
                View transcript
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

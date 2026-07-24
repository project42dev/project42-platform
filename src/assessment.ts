import type { KnowledgeQuestion } from "./schema.js";

export interface QuestionFeedback {
  questionId: string;
  selectedIndex: number | null;
  answerIndex: number;
  correct: boolean;
  explanation: string;
}

export interface AssessmentResult {
  correct: number;
  total: number;
  scorePercent: number;
  passed: boolean;
  feedback: QuestionFeedback[];
}

export function scoreKnowledgeCheck(
  questions: KnowledgeQuestion[],
  answers: Record<string, number>,
  passPercent = 80,
): AssessmentResult {
  const feedback = questions.map((question) => {
    const selectedIndex = answers[question.id] ?? null;
    return {
      questionId: question.id,
      selectedIndex,
      answerIndex: question.answerIndex,
      correct: selectedIndex === question.answerIndex,
      explanation: question.explanation,
    };
  });
  const correct = feedback.filter((item) => item.correct).length;
  const total = questions.length;
  const scorePercent = total === 0 ? 0 : Math.round((correct / total) * 100);

  return {
    correct,
    total,
    scorePercent,
    passed: total > 0 && scorePercent >= passPercent,
    feedback,
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTranscript,
  createEmptyProgress,
  recordAssessmentAttempt,
  scoreKnowledgeCheck,
  starterCatalog,
  validateCatalog,
} from "../dist/index.js";

test("starter catalog is valid", () => {
  assert.deepEqual(validateCatalog(starterCatalog), { valid: true, errors: [] });
});

test("scores a knowledge check and returns explanations", () => {
  const module = starterCatalog.modules[0];
  const answers = Object.fromEntries(
    module.knowledgeCheck.questions.map((question) => [question.id, question.answerIndex]),
  );
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    answers,
    module.knowledgeCheck.passPercent,
  );

  assert.equal(result.scorePercent, 100);
  assert.equal(result.passed, true);
  assert.equal(result.feedback.length, module.knowledgeCheck.questions.length);
});

test("records attempts idempotently and builds a transcript", () => {
  const path = starterCatalog.paths[0];
  const module = starterCatalog.modules.find((candidate) => candidate.id === path.moduleIds[0]);
  assert.ok(module);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [question.id, question.answerIndex]),
    ),
  );
  const input = {
    attemptId: "attempt-1",
    pathId: path.id,
    moduleId: module.id,
    completedAt: "2026-07-23T12:00:00.000Z",
    result,
  };
  const once = recordAssessmentAttempt(createEmptyProgress(), starterCatalog, input);
  const twice = recordAssessmentAttempt(once, starterCatalog, input);
  const transcript = buildTranscript(starterCatalog, twice);

  assert.equal(twice.attempts.length, 1);
  assert.deepEqual(twice.completedModuleIds, [module.id]);
  assert.equal(transcript[0].completedModules, 1);
});

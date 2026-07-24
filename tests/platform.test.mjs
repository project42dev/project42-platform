import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildPortableLearnerRecord,
  buildTranscriptCsv,
  buildTranscript,
  createEmptyProgress,
  recordAssessmentAttempt,
  scoreKnowledgeCheck,
  starterCatalog,
  validateCatalog,
  validatePortableLearnerRecord,
} from "../dist/index.js";

test("starter catalog is valid", () => {
  assert.deepEqual(validateCatalog(starterCatalog), { valid: true, errors: [] });
});

test("catalog validation catches broken references and unsafe source metadata", () => {
  const broken = structuredClone(starterCatalog);
  broken.paths[0].moduleIds.push("missing-module");
  broken.modules[0].providers = [];
  broken.modules[0].sources[0].url = "http://example.com/source";
  broken.resources[0].lastVerified = "next Thursday";

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Path ai-foundations references missing module missing-module",
    ),
  );
  assert.ok(validation.errors.includes("Module what-ai-does has no providers"));
  assert.ok(
    validation.errors.includes(
      "Module what-ai-does source must use HTTPS: http://example.com/source",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Resource ai-glossary has an invalid lastVerified date",
    ),
  );
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

test("exports a portable learner record and spreadsheet-safe transcript", () => {
  const progress = {
    ...createEmptyProgress("=SUM(A1:A2)"),
    updatedAt: "2026-07-23T12:00:00.000Z",
  };
  const record = buildPortableLearnerRecord(
    starterCatalog,
    progress,
    "2026-07-23T12:30:00.000Z",
  );
  const csv = buildTranscriptCsv(starterCatalog, progress);

  assert.deepEqual(validatePortableLearnerRecord(record), { valid: true, errors: [] });
  assert.equal(record.catalogVersion, starterCatalog.contentVersion);
  assert.equal(record.transcript.length, starterCatalog.paths.length);
  assert.match(csv, /Path,Completed modules/);
  assert.match(csv, /AI Foundations/);
});

test("rejects incompatible learner-record exports", () => {
  assert.deepEqual(
    validatePortableLearnerRecord({
      format: "another-product",
      formatVersion: "9",
      exportedAt: "not-a-date",
      catalogVersion: "",
      learner: null,
      transcript: null,
    }),
    {
      valid: false,
      errors: [
        "Unsupported learner-record format",
        "Unsupported learner-record version",
        "exportedAt must be an ISO date",
        "catalogVersion is required",
        "learner is not a valid version 1 progress record",
        "transcript must be an array",
      ],
    },
  );
});

test("content freshness gate passes current sources and rejects stale ones", () => {
  const current = runFreshnessCheck("2026-07-23");
  const stale = runFreshnessCheck("2027-07-23");

  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /Checked 12 references/);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /ERROR .* is \d+ days old/);
});

function runFreshnessCheck(asOf) {
  return spawnSync(process.execPath, ["scripts/check-freshness.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PROJECT42_AS_OF: asOf },
  });
}

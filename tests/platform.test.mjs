import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildAssessmentHistory,
  buildPortableLearnerRecord,
  buildTranscriptCsv,
  buildTranscript,
  createEmptyProgress,
  recordAssessmentAttempt,
  recordModuleVisit,
  restorePortableLearnerRecord,
  scoreKnowledgeCheck,
  starterCatalog,
  validateCatalog,
  validatePortableLearnerRecord,
} from "../dist/index.js";

test("starter catalog is valid", () => {
  assert.deepEqual(validateCatalog(starterCatalog), { valid: true, errors: [] });
  assert.equal(starterCatalog.contentVersion, "0.5.0");
  assert.equal(starterCatalog.paths[0].moduleIds.length, 11);
  assert.equal(starterCatalog.modules.length, 17);
});

test("AI Foundations preserves its prerequisite chain and varied answer positions", () => {
  const path = starterCatalog.paths.find((candidate) => candidate.id === "ai-foundations");
  assert.ok(path);
  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );

  for (let index = 1; index < path.moduleIds.length; index += 1) {
    const module = modules.get(path.moduleIds[index]);
    assert.ok(module);
    assert.ok(
      module.prerequisites.includes(path.moduleIds[index - 1]),
      `${module.id} must require ${path.moduleIds[index - 1]}`,
    );
  }

  for (const moduleId of [
    "prompt-anatomy-and-success-criteria",
    "context-and-evidence-construction",
    "examples-and-output-contracts",
    "verification-and-iterative-improvement",
  ]) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
  }
});

test("catalog validation catches broken references and unsafe source metadata", () => {
  const broken = structuredClone(starterCatalog);
  broken.paths[0].moduleIds.push("missing-module");
  broken.modules[0].providers = [];
  broken.modules[0].sources[0].url = "http://example.com/source";
  broken.modules[0].sections.push(structuredClone(broken.modules[0].sections[0]));
  broken.modules[0].prerequisites = ["prompt-with-purpose"];
  broken.resources[0].lastVerified = "next Thursday";
  broken.modules[1].prerequisites = ["what-ai-does"];

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
  assert.ok(
    validation.errors.includes(
      "Module what-ai-does has duplicate section id models-predict",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Prerequisite cycle includes module what-ai-does",
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
  const history = buildAssessmentHistory(starterCatalog, twice);

  assert.equal(twice.attempts.length, 1);
  assert.deepEqual(twice.completedModuleIds, [module.id]);
  assert.equal(transcript[0].completedModules, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].moduleTitle, module.title);
  assert.equal(history[0].scorePercent, 100);
  assert.equal(history[0].passed, true);
});

test("records a recent module visit without completing the lesson", () => {
  const path = starterCatalog.paths[0];
  const moduleId = path.moduleIds[0];
  const visited = recordModuleVisit(createEmptyProgress(), starterCatalog, {
    pathId: path.id,
    moduleId,
    visitedAt: "2026-07-23T13:00:00.000Z",
  });

  assert.deepEqual(visited.startedPathIds, [path.id]);
  assert.deepEqual(visited.completedModuleIds, []);
  assert.deepEqual(visited.recentModule, {
    pathId: path.id,
    moduleId,
    visitedAt: "2026-07-23T13:00:00.000Z",
  });
  assert.throws(
    () =>
      recordModuleVisit(visited, starterCatalog, {
        pathId: path.id,
        moduleId: "not-in-this-path",
        visitedAt: "2026-07-23T13:01:00.000Z",
      }),
    /does not belong/,
  );
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
  assert.match(csv, /Path,Module,Completed modules/);
  assert.match(csv, /AI Foundations/);
  assert.deepEqual(restorePortableLearnerRecord(record, starterCatalog), {
    valid: true,
    progress,
  });
});

test("exports individual assessment attempts in the transcript CSV", () => {
  const path = starterCatalog.paths[0];
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === path.moduleIds[0],
  );
  assert.ok(module);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const progress = recordAssessmentAttempt(createEmptyProgress(), starterCatalog, {
    attemptId: "attempt-csv",
    pathId: path.id,
    moduleId: module.id,
    completedAt: "2026-07-23T12:00:00.000Z",
    result,
  });
  const csv = buildTranscriptCsv(starterCatalog, progress);

  assert.ok(csv.includes(module.title));
  assert.ok(
    csv.includes(
      `2026-07-23T12:00:00.000Z,100,Yes,${starterCatalog.contentVersion}`,
    ),
  );
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
        "transcript must be an array of valid path summaries",
      ],
    },
  );
});

test("rejects unsafe learner records and accepts compatible older catalogs", () => {
  const record = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  record.learner.attempts.push({
    id: "unknown-attempt",
    pathId: "unknown-path",
    moduleId: "unknown-module",
    contentVersion: starterCatalog.contentVersion,
    scorePercent: 100,
    passed: true,
    completedAt: "2026-07-23T12:00:00.000Z",
  });

  const result = restorePortableLearnerRecord(record, starterCatalog);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("unknown path")));
  assert.ok(result.errors.some((error) => error.includes("unknown module")));

  const compatibleOlderRecord = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  compatibleOlderRecord.catalogVersion = "0.0.1";
  assert.equal(
    restorePortableLearnerRecord(compatibleOlderRecord, starterCatalog).valid,
    true,
  );

  const malformed = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  malformed.learner.displayName = "x".repeat(81);
  assert.deepEqual(validatePortableLearnerRecord(malformed), {
    valid: false,
    errors: ["learner is not a valid version 1 progress record"],
  });
});

test("content freshness gate passes current sources and rejects stale ones", () => {
  const current = runFreshnessCheck("2026-07-23");
  const stale = runFreshnessCheck("2027-07-23");

  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /Checked 44 references/);
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

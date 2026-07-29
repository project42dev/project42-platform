import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITATIVE_TRANSCRIPT_CSV_COLUMNS,
  AUTHORITATIVE_TRANSCRIPT_CSV_SCHEMA_VERSION,
  buildAuthoritativeTranscriptCsv,
  escapeCsvCell,
} from "../dist/index.js";

function records() {
  return {
    moduleProgress: [
      {
        pathId: "path-z",
        moduleId: "@module-formula",
        contentVersion: "2026.7.0",
        status: "visited",
        firstSeenAt: "2026-07-29T10:00:00.000Z",
        completedAt: null,
        updatedAt: "2026-07-29T10:00:00.000Z",
      },
      {
        pathId: "path-a",
        moduleId: "module-safe",
        contentVersion: "2026.7.0",
        status: "completed",
        firstSeenAt: "2026-07-29T09:00:00.000Z",
        completedAt: "2026-07-29T09:30:00.000Z",
        updatedAt: "2026-07-29T09:30:00.000Z",
      },
    ],
    assessmentAttempts: [
      {
        id: "attempt-z",
        pathId: "path-z",
        moduleId: "module-z",
        contentVersion: "2026.7.0",
        scorePercent: 40,
        passed: false,
        completedAt: "2026-07-29T12:00:00.000Z",
        recordedAt: "2026-07-29T12:00:01.000Z",
      },
      {
        id: "attempt-a",
        pathId: "path-a",
        moduleId: "module-a",
        contentVersion: "2026.7.0",
        scorePercent: 95,
        passed: true,
        completedAt: "2026-07-29T11:00:00.000Z",
        recordedAt: "2026-07-29T11:00:01.000Z",
      },
    ],
    transcriptEntries: [
      {
        pathId: "path-z",
        pathTitle: '=HYPERLINK("https://example.test","unsafe")',
        completedModules: 0,
        totalModules: 2,
        completionPercent: 0,
        bestScorePercent: 40,
        contentVersion: "2026.7.0",
        updatedAt: "2026-07-29T12:00:01.000Z",
      },
      {
        pathId: "path-a",
        pathTitle: "Safe path",
        completedModules: 2,
        totalModules: 2,
        completionPercent: 100,
        bestScorePercent: 95,
        contentVersion: "2026.7.0",
        updatedAt: "2026-07-29T11:00:01.000Z",
      },
    ],
    achievements: [
      {
        badgeId: "achievement-z",
        name: "\t+SUM(1,1)",
        description: "Untrusted achievement display text.",
        earnedAt: "2026-07-29T13:00:00.000Z",
        evidenceModuleIds: ["module-safe", "-cmd|' /C calc'!A0"],
        recordedAt: "2026-07-29T13:00:01.000Z",
      },
    ],
  };
}

test("builds a deterministic provider-neutral authoritative transcript", () => {
  const input = records();
  const snapshot = structuredClone(input);
  const first = buildAuthoritativeTranscriptCsv(input);
  const second = buildAuthoritativeTranscriptCsv({
    moduleProgress: [...input.moduleProgress].reverse(),
    assessmentAttempts: [...input.assessmentAttempts].reverse(),
    transcriptEntries: [...input.transcriptEntries].reverse(),
    achievements: [...input.achievements].reverse(),
  });

  assert.equal(first, second);
  assert.deepEqual(input, snapshot);
  assert.equal(
    first.split("\r\n")[0],
    AUTHORITATIVE_TRANSCRIPT_CSV_COLUMNS.map(escapeCsvCell).join(","),
  );
  assert.match(first, new RegExp(`"${AUTHORITATIVE_TRANSCRIPT_CSV_SCHEMA_VERSION}"`));
  assert.match(first, /"durable-account-record","path_progress"/);
  assert.match(first, /"assessment_attempt".*"passed"/);
  assert.match(first, /"assessment_attempt".*"not_passed"/);
  assert.match(
    first,
    /"learning_achievement".*"not_issued_credential"/,
  );
});

test("neutralizes spreadsheet formulas after leading control or whitespace", () => {
  for (const value of [
    "=2+3",
    "+2+3",
    "-2+3",
    "@SUM(1,1)",
    "\t=2+3",
    " \r\n+2+3",
  ]) {
    assert.equal(escapeCsvCell(value).startsWith('"\''),
      true,
      `expected formula neutralization for ${JSON.stringify(value)}`);
  }
  assert.equal(escapeCsvCell("safe"), '"safe"');
  assert.equal(escapeCsvCell('value "quoted"'), '"value ""quoted"""');

  const csv = buildAuthoritativeTranscriptCsv(records());
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test"",""unsafe""\)"/);
  assert.match(csv, /"'\t\+SUM\(1,1\)"/);
  assert.doesNotMatch(csv, /,"=HYPERLINK/);
  assert.doesNotMatch(csv, /,"\t\+SUM/);
});

import type {
  AuthoritativeTranscriptRecords,
  LearnerAchievementRecord,
  LearnerAssessmentAttemptRecord,
  LearnerModuleProgressRecord,
  LearnerTranscriptEntryRecord,
} from "./api-contract.js";

export const AUTHORITATIVE_TRANSCRIPT_CSV_SCHEMA_VERSION = "1.0" as const;

export const AUTHORITATIVE_TRANSCRIPT_CSV_COLUMNS = [
  "schema_version",
  "record_authority",
  "record_type",
  "record_id",
  "title",
  "path_id",
  "module_id",
  "content_version",
  "progress_status",
  "completed_modules",
  "total_modules",
  "completion_percent",
  "score_percent",
  "result",
  "occurred_at",
  "updated_at",
  "evidence_ids",
  "credential_status",
] as const;

export type AuthoritativeTranscriptCsvColumn =
  (typeof AUTHORITATIVE_TRANSCRIPT_CSV_COLUMNS)[number];

type CsvRow = Record<AuthoritativeTranscriptCsvColumn, string | number | null>;

export function buildAuthoritativeTranscriptCsv(
  records: AuthoritativeTranscriptRecords,
): string {
  const rows = [
    ...sortedTranscriptEntries(records.transcriptEntries).map(pathRow),
    ...sortedModuleProgress(records.moduleProgress).map(moduleRow),
    ...sortedAssessmentAttempts(records.assessmentAttempts).map(assessmentRow),
    ...sortedAchievements(records.achievements).map(achievementRow),
  ];
  return [
    AUTHORITATIVE_TRANSCRIPT_CSV_COLUMNS.map(escapeCsvCell).join(","),
    ...rows.map((row) =>
      AUTHORITATIVE_TRANSCRIPT_CSV_COLUMNS.map((column) =>
        escapeCsvCell(row[column]),
      ).join(","),
    ),
  ].join("\r\n") + "\r\n";
}

export function escapeCsvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/u.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function baseRow(
  recordType: string,
  recordId: string,
): CsvRow {
  return {
    schema_version: AUTHORITATIVE_TRANSCRIPT_CSV_SCHEMA_VERSION,
    record_authority: "durable-account-record",
    record_type: recordType,
    record_id: recordId,
    title: "",
    path_id: "",
    module_id: "",
    content_version: "",
    progress_status: "",
    completed_modules: null,
    total_modules: null,
    completion_percent: null,
    score_percent: null,
    result: "",
    occurred_at: "",
    updated_at: "",
    evidence_ids: "",
    credential_status: "",
  };
}

function pathRow(entry: LearnerTranscriptEntryRecord): CsvRow {
  return {
    ...baseRow("path_progress", entry.pathId),
    title: entry.pathTitle,
    path_id: entry.pathId,
    content_version: entry.contentVersion,
    progress_status:
      entry.totalModules > 0 && entry.completedModules >= entry.totalModules
        ? "completed"
        : "in_progress",
    completed_modules: entry.completedModules,
    total_modules: entry.totalModules,
    completion_percent: entry.completionPercent,
    score_percent: entry.bestScorePercent,
    updated_at: entry.updatedAt,
  };
}

function moduleRow(entry: LearnerModuleProgressRecord): CsvRow {
  return {
    ...baseRow(
      "module_progress",
      `${entry.pathId}:${entry.moduleId}:${entry.contentVersion}`,
    ),
    path_id: entry.pathId,
    module_id: entry.moduleId,
    content_version: entry.contentVersion,
    progress_status: entry.status,
    occurred_at: entry.completedAt ?? entry.firstSeenAt,
    updated_at: entry.updatedAt,
  };
}

function assessmentRow(entry: LearnerAssessmentAttemptRecord): CsvRow {
  return {
    ...baseRow("assessment_attempt", entry.id),
    path_id: entry.pathId,
    module_id: entry.moduleId,
    content_version: entry.contentVersion,
    score_percent: entry.scorePercent,
    result: entry.passed ? "passed" : "not_passed",
    occurred_at: entry.completedAt,
    updated_at: entry.recordedAt,
  };
}

function achievementRow(entry: LearnerAchievementRecord): CsvRow {
  return {
    ...baseRow("learning_achievement", entry.badgeId),
    title: entry.name,
    occurred_at: entry.earnedAt,
    updated_at: entry.recordedAt,
    evidence_ids: entry.evidenceModuleIds.join("|"),
    credential_status: "not_issued_credential",
  };
}

function sortedTranscriptEntries(
  values: LearnerTranscriptEntryRecord[],
): LearnerTranscriptEntryRecord[] {
  return [...values].sort((left, right) =>
    compareKeys(left.pathId, left.contentVersion, right.pathId, right.contentVersion),
  );
}

function sortedModuleProgress(
  values: LearnerModuleProgressRecord[],
): LearnerModuleProgressRecord[] {
  return [...values].sort((left, right) =>
    compareKeys(
      `${left.pathId}:${left.moduleId}`,
      left.contentVersion,
      `${right.pathId}:${right.moduleId}`,
      right.contentVersion,
    ),
  );
}

function sortedAssessmentAttempts(
  values: LearnerAssessmentAttemptRecord[],
): LearnerAssessmentAttemptRecord[] {
  return [...values].sort((left, right) =>
    compareKeys(left.completedAt, left.id, right.completedAt, right.id),
  );
}

function sortedAchievements(
  values: LearnerAchievementRecord[],
): LearnerAchievementRecord[] {
  return [...values].sort((left, right) =>
    compareKeys(left.earnedAt, left.badgeId, right.earnedAt, right.badgeId),
  );
}

function compareKeys(
  leftPrimary: string,
  leftSecondary: string,
  rightPrimary: string,
  rightSecondary: string,
): number {
  return (
    leftPrimary.localeCompare(rightPrimary) ||
    leftSecondary.localeCompare(rightSecondary)
  );
}

import { buildTranscript, type LearnerProgress, type TranscriptEntry } from "./progress.js";
import type { Catalog } from "./schema.js";

export interface PortableLearnerRecordV1 {
  format: "project42/learner-record";
  formatVersion: "1.0";
  exportedAt: string;
  catalogVersion: string;
  learner: LearnerProgress;
  transcript: TranscriptEntry[];
}

export interface PortableRecordValidation {
  valid: boolean;
  errors: string[];
}

export type PortableRecordRestoreResult =
  | {
      valid: true;
      progress: LearnerProgress;
    }
  | {
      valid: false;
      errors: string[];
    };

export function buildPortableLearnerRecord(
  catalog: Catalog,
  progress: LearnerProgress,
  exportedAt = new Date().toISOString(),
): PortableLearnerRecordV1 {
  return {
    format: "project42/learner-record",
    formatVersion: "1.0",
    exportedAt,
    catalogVersion: catalog.contentVersion,
    learner: structuredClone(progress),
    transcript: buildTranscript(catalog, progress),
  };
}

export function serializePortableLearnerRecord(
  record: PortableLearnerRecordV1,
): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function buildTranscriptCsv(
  catalog: Catalog,
  progress: LearnerProgress,
): string {
  const rows = [
    [
      "Path",
      "Completed modules",
      "Total modules",
      "Completion percent",
      "Best score percent",
    ],
    ...buildTranscript(catalog, progress).map((entry) => [
      entry.pathTitle,
      String(entry.completedModules),
      String(entry.totalModules),
      String(entry.completionPercent),
      entry.bestScorePercent === null ? "" : String(entry.bestScorePercent),
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}

export function validatePortableLearnerRecord(
  value: unknown,
): PortableRecordValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ["Learner record must be an object"] };
  }

  if (value.format !== "project42/learner-record") {
    errors.push("Unsupported learner-record format");
  }
  if (value.formatVersion !== "1.0") {
    errors.push("Unsupported learner-record version");
  }
  if (!isIsoDate(value.exportedAt)) {
    errors.push("exportedAt must be an ISO date");
  }
  if (typeof value.catalogVersion !== "string" || !value.catalogVersion.trim()) {
    errors.push("catalogVersion is required");
  }
  if (!isLearnerProgress(value.learner)) {
    errors.push("learner is not a valid version 1 progress record");
  }
  if (
    !Array.isArray(value.transcript) ||
    !value.transcript.every(isTranscriptEntry)
  ) {
    errors.push("transcript must be an array of valid path summaries");
  }

  return { valid: errors.length === 0, errors };
}

export function restorePortableLearnerRecord(
  value: unknown,
  catalog: Catalog,
): PortableRecordRestoreResult {
  const validation = validatePortableLearnerRecord(value);
  if (!validation.valid || !isPortableLearnerRecord(value)) {
    return { valid: false, errors: validation.errors };
  }

  const errors: string[] = [];
  const pathIds = new Set(catalog.paths.map((path) => path.id));
  const moduleToPath = new Map<string, string>();
  for (const path of catalog.paths) {
    for (const moduleId of path.moduleIds) moduleToPath.set(moduleId, path.id);
  }

  for (const pathId of value.learner.startedPathIds) {
    if (!pathIds.has(pathId)) errors.push(`Record references unknown path ${pathId}`);
  }
  for (const moduleId of value.learner.completedModuleIds) {
    if (!moduleToPath.has(moduleId)) {
      errors.push(`Record references unknown module ${moduleId}`);
    }
  }
  for (const attempt of value.learner.attempts) {
    if (!pathIds.has(attempt.pathId)) {
      errors.push(`Attempt ${attempt.id} references unknown path ${attempt.pathId}`);
    }
    const expectedPathId = moduleToPath.get(attempt.moduleId);
    if (!expectedPathId) {
      errors.push(`Attempt ${attempt.id} references unknown module ${attempt.moduleId}`);
    } else if (attempt.pathId !== expectedPathId) {
      errors.push(
        `Attempt ${attempt.id} does not match module ${attempt.moduleId}'s learning path`,
      );
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    progress: structuredClone(value.learner),
  };
}

function escapeCsvCell(value: string): string {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue)
    ? `"${safeValue.replaceAll('"', '""')}"`
    : safeValue;
}

function isLearnerProgress(value: unknown): value is LearnerProgress {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.displayName === "string" &&
    value.displayName.length <= 80 &&
    isUniqueStringArray(value.startedPathIds) &&
    isUniqueStringArray(value.completedModuleIds) &&
    Array.isArray(value.attempts) &&
    value.attempts.every(isAssessmentAttempt) &&
    hasUniqueIds(value.attempts) &&
    Array.isArray(value.badges) &&
    value.badges.every(isEarnedBadge) &&
    hasUniqueIds(value.badges) &&
    isIsoDate(value.updatedAt)
  );
}

function isPortableLearnerRecord(
  value: unknown,
): value is PortableLearnerRecordV1 {
  return (
    isRecord(value) &&
    value.format === "project42/learner-record" &&
    value.formatVersion === "1.0" &&
    isIsoDate(value.exportedAt) &&
    typeof value.catalogVersion === "string" &&
    isLearnerProgress(value.learner) &&
    Array.isArray(value.transcript) &&
    value.transcript.every(isTranscriptEntry)
  );
}

function isAssessmentAttempt(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.pathId) &&
    isNonEmptyString(value.moduleId) &&
    isNonEmptyString(value.contentVersion) &&
    typeof value.scorePercent === "number" &&
    Number.isFinite(value.scorePercent) &&
    value.scorePercent >= 0 &&
    value.scorePercent <= 100 &&
    typeof value.passed === "boolean" &&
    isIsoDate(value.completedAt)
  );
}

function isEarnedBadge(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.description) &&
    isIsoDate(value.earnedAt) &&
    isUniqueStringArray(value.evidenceModuleIds)
  );
}

function isTranscriptEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.pathId) &&
    isNonEmptyString(value.pathTitle) &&
    isNonNegativeInteger(value.completedModules) &&
    isNonNegativeInteger(value.totalModules) &&
    typeof value.completionPercent === "number" &&
    Number.isFinite(value.completionPercent) &&
    value.completionPercent >= 0 &&
    value.completionPercent <= 100 &&
    (value.bestScorePercent === null ||
      (typeof value.bestScorePercent === "number" &&
        Number.isFinite(value.bestScorePercent) &&
        value.bestScorePercent >= 0 &&
        value.bestScorePercent <= 100))
  );
}

function isUniqueStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function hasUniqueIds(values: unknown[]): boolean {
  const ids = values
    .filter(isRecord)
    .map((value) => value.id)
    .filter((id): id is string => typeof id === "string");
  return ids.length === values.length && new Set(ids).size === ids.length;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

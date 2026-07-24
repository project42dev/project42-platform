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
  if (!Array.isArray(value.transcript)) {
    errors.push("transcript must be an array");
  }

  return { valid: errors.length === 0, errors };
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
    Array.isArray(value.startedPathIds) &&
    Array.isArray(value.completedModuleIds) &&
    Array.isArray(value.attempts) &&
    Array.isArray(value.badges) &&
    isIsoDate(value.updatedAt)
  );
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

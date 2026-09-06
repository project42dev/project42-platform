import type {
  AssessmentAttempt,
  Catalog,
  CapstoneSubmission,
  EarnedBadge,
  LearnerProgress,
} from "@project42/platform";
import {
  buildPortableLearnerRecord,
  buildTranscript,
} from "@project42/platform";
import { validateDeviceLocalProgressValue } from "./deviceLocalProgress.ts";

export interface ProgressMigrationConflict {
  id: string;
  kind: "assessment-attempt" | "capstone-submission";
  message: string;
}

export interface ProgressMigrationCounts {
  attempts: number;
  badges: number;
  capstoneSubmissions: number;
  completedModules: number;
  startedPaths: number;
}

export interface ProgressMigrationPreview {
  conflicts: ProgressMigrationConflict[];
  local: ProgressMigrationCounts;
  merged: ProgressMigrationCounts;
  remote: ProgressMigrationCounts;
  mergedProgress: LearnerProgress;
  localProgress: LearnerProgress;
  remoteProgress: LearnerProgress;
  localAdditions: ProgressMigrationCounts;
  remoteOnly: ProgressMigrationCounts;
  duplicateAttempts: number;
  duplicateCapstoneSubmissions: number;
  requiresMigration: boolean;
}

export function canonicalProgressValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalProgressValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalProgressValue(item)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function mergeImmutableRecords<T extends { id: string }>(
  local: T[],
  remote: T[],
  kind: ProgressMigrationConflict["kind"],
): {
  conflicts: ProgressMigrationConflict[];
  duplicates: number;
  records: T[];
} {
  const records = new Map(remote.map((record) => [record.id, record]));
  const conflicts: ProgressMigrationConflict[] = [];
  let duplicates = 0;

  for (const record of local) {
    const existing = records.get(record.id);
    if (!existing) {
      records.set(record.id, record);
      continue;
    }
    if (canonicalProgressValue(existing) === canonicalProgressValue(record)) {
      duplicates += 1;
      continue;
    }
    conflicts.push({
      id: record.id,
      kind,
      message:
        kind === "assessment-attempt"
          ? `Assessment attempt ${record.id} has different evidence in the browser and account.`
          : `Capstone submission ${record.id} has different evidence in the browser and account.`,
    });
  }

  return {
    conflicts,
    duplicates,
    records: [...records.values()],
  };
}

function mergeBadges(local: EarnedBadge[], remote: EarnedBadge[]): EarnedBadge[] {
  const badges = new Map(remote.map((badge) => [badge.id, badge]));
  for (const badge of local) {
    const existing = badges.get(badge.id);
    if (!existing) {
      badges.set(badge.id, badge);
      continue;
    }
    badges.set(badge.id, {
      ...existing,
      earnedAt:
        existing.earnedAt.localeCompare(badge.earnedAt) <= 0
          ? existing.earnedAt
          : badge.earnedAt,
      evidenceModuleIds: uniqueSorted([
        ...existing.evidenceModuleIds,
        ...badge.evidenceModuleIds,
      ]),
    });
  }
  return [...badges.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function latestRecentModule(
  local: LearnerProgress["recentModule"],
  remote: LearnerProgress["recentModule"],
): LearnerProgress["recentModule"] {
  if (!local) return remote;
  if (!remote) return local;
  return local.visitedAt.localeCompare(remote.visitedAt) > 0 ? local : remote;
}

function counts(progress: LearnerProgress): ProgressMigrationCounts {
  return {
    attempts: progress.attempts.length,
    badges: progress.badges.length,
    capstoneSubmissions: progress.capstoneSubmissions?.length ?? 0,
    completedModules: progress.completedModuleIds.length,
    startedPaths: progress.startedPathIds.length,
  };
}

function additions(
  local: LearnerProgress,
  remote: LearnerProgress,
): ProgressMigrationCounts {
  const remoteAttemptIds = new Set(remote.attempts.map((attempt) => attempt.id));
  const remoteBadgeIds = new Set(remote.badges.map((badge) => badge.id));
  const remoteCapstoneIds = new Set(
    (remote.capstoneSubmissions ?? []).map((submission) => submission.id),
  );
  const remoteModules = new Set(remote.completedModuleIds);
  const remotePaths = new Set(remote.startedPathIds);
  return {
    attempts: local.attempts.filter((attempt) => !remoteAttemptIds.has(attempt.id))
      .length,
    badges: local.badges.filter((badge) => !remoteBadgeIds.has(badge.id)).length,
    capstoneSubmissions: (local.capstoneSubmissions ?? []).filter(
      (submission) => !remoteCapstoneIds.has(submission.id),
    ).length,
    completedModules: local.completedModuleIds.filter(
      (moduleId) => !remoteModules.has(moduleId),
    ).length,
    startedPaths: local.startedPathIds.filter((pathId) => !remotePaths.has(pathId))
      .length,
  };
}

function remoteOnly(
  local: LearnerProgress,
  remote: LearnerProgress,
): ProgressMigrationCounts {
  return additions(remote, local);
}

export function hasLearningEvidence(progress: LearnerProgress): boolean {
  return (
    progress.startedPathIds.length > 0 ||
    progress.completedModuleIds.length > 0 ||
    progress.attempts.length > 0 ||
    (progress.capstoneSubmissions?.length ?? 0) > 0 ||
    progress.badges.length > 0 ||
    Boolean(progress.recentModule)
  );
}

export function createProgressMigrationPreview(
  local: LearnerProgress,
  remote: LearnerProgress,
): ProgressMigrationPreview {
  const attempts = mergeImmutableRecords<AssessmentAttempt>(
    local.attempts,
    remote.attempts,
    "assessment-attempt",
  );
  const capstones = mergeImmutableRecords<CapstoneSubmission>(
    local.capstoneSubmissions ?? [],
    remote.capstoneSubmissions ?? [],
    "capstone-submission",
  );
  const updatedAt =
    local.updatedAt.localeCompare(remote.updatedAt) > 0
      ? local.updatedAt
      : remote.updatedAt;
  const recentModule = latestRecentModule(
    local.recentModule,
    remote.recentModule,
  );
  const mergedProgress: LearnerProgress = {
    schemaVersion: 1,
    displayName:
      remote.displayName.trim() && remote.displayName !== "Explorer"
        ? remote.displayName
        : local.displayName,
    startedPathIds: uniqueSorted([
      ...remote.startedPathIds,
      ...local.startedPathIds,
    ]),
    completedModuleIds: uniqueSorted([
      ...remote.completedModuleIds,
      ...local.completedModuleIds,
    ]),
    attempts: attempts.records.sort((left, right) =>
      left.completedAt.localeCompare(right.completedAt) ||
      left.id.localeCompare(right.id),
    ),
    capstoneSubmissions: capstones.records.sort((left, right) =>
      left.submittedAt.localeCompare(right.submittedAt) ||
      left.id.localeCompare(right.id),
    ),
    badges: mergeBadges(local.badges, remote.badges),
    ...(recentModule ? { recentModule } : {}),
    updatedAt,
  };
  const normalizedRemote: LearnerProgress = {
    ...remote,
    capstoneSubmissions: remote.capstoneSubmissions ?? [],
  };

  return {
    conflicts: [...attempts.conflicts, ...capstones.conflicts],
    local: counts(local),
    merged: counts(mergedProgress),
    remote: counts(remote),
    mergedProgress,
    localProgress: structuredClone(local),
    remoteProgress: structuredClone(normalizedRemote),
    localAdditions: additions(local, remote),
    remoteOnly: remoteOnly(local, remote),
    duplicateAttempts: attempts.duplicates,
    duplicateCapstoneSubmissions: capstones.duplicates,
    requiresMigration:
      canonicalProgressValue(mergedProgress) !==
      canonicalProgressValue(normalizedRemote),
  };
}

export function needsProgressMigration(
  preview: ProgressMigrationPreview,
): boolean {
  return (
    preview.conflicts.length > 0 ||
    preview.requiresMigration
  );
}

export async function createProgressImportId(
  progress: LearnerProgress,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalProgressValue(progress)),
  );
  return `browser-local-v1-${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export type ProgressMigrationItemKind =
  | "started-path"
  | "completed-module"
  | "assessment-attempt"
  | "capstone-submission"
  | "badge";

export type ProgressMigrationDisposition =
  | "will-add"
  | "already-in-account"
  | "will-merge"
  | "conflict";

export interface ProgressMigrationItem {
  kind: ProgressMigrationItemKind;
  id: string;
  title: string;
  detail: string;
  disposition: ProgressMigrationDisposition;
}

function pathTitle(catalog: Catalog, pathId: string): string {
  return (
    catalog.paths.find((path) => path.id === pathId)?.title ??
    `Unknown path ${pathId}`
  );
}

function moduleTitle(catalog: Catalog, moduleId: string): string {
  return (
    catalog.modules.find((module) => module.id === moduleId)?.title ??
    `Unknown module ${moduleId}`
  );
}

function immutableDisposition<T extends { id: string }>(
  local: T,
  remote: T[],
): ProgressMigrationDisposition {
  const existing = remote.find((record) => record.id === local.id);
  if (!existing) return "will-add";
  return canonicalProgressValue(existing) === canonicalProgressValue(local)
    ? "already-in-account"
    : "conflict";
}

export function buildProgressMigrationItems(
  preview: ProgressMigrationPreview,
  catalog: Catalog,
): ProgressMigrationItem[] {
  const remotePaths = new Set(preview.remoteProgress.startedPathIds);
  const remoteModules = new Set(preview.remoteProgress.completedModuleIds);
  const remoteBadges = new Map(
    preview.remoteProgress.badges.map((badge) => [badge.id, badge]),
  );
  return [
    ...preview.localProgress.startedPathIds.map((pathId) => ({
      kind: "started-path" as const,
      id: pathId,
      title: pathTitle(catalog, pathId),
      detail: "Learning-path enrollment",
      disposition: remotePaths.has(pathId)
        ? ("already-in-account" as const)
        : ("will-add" as const),
    })),
    ...preview.localProgress.completedModuleIds.map((moduleId) => ({
      kind: "completed-module" as const,
      id: moduleId,
      title: moduleTitle(catalog, moduleId),
      detail: "Completed module",
      disposition: remoteModules.has(moduleId)
        ? ("already-in-account" as const)
        : ("will-add" as const),
    })),
    ...preview.localProgress.attempts.map((attempt) => ({
      kind: "assessment-attempt" as const,
      id: attempt.id,
      title: moduleTitle(catalog, attempt.moduleId),
      detail: `${attempt.scorePercent}% · ${attempt.passed ? "passed" : "not passed"} · ${attempt.completedAt}`,
      disposition: immutableDisposition(
        attempt,
        preview.remoteProgress.attempts,
      ),
    })),
    ...(preview.localProgress.capstoneSubmissions ?? []).map((submission) => ({
      kind: "capstone-submission" as const,
      id: submission.id,
      title: moduleTitle(catalog, submission.moduleId),
      detail: `${submission.scorePercent}% · ${submission.passed ? "passed" : "not passed"} · ${submission.submittedAt}`,
      disposition: immutableDisposition(
        submission,
        preview.remoteProgress.capstoneSubmissions ?? [],
      ),
    })),
    ...preview.localProgress.badges.map((badge) => {
      const existing = remoteBadges.get(badge.id);
      const disposition: ProgressMigrationDisposition = !existing
        ? "will-add"
        : canonicalProgressValue(existing) === canonicalProgressValue(badge)
          ? "already-in-account"
          : "will-merge";
      return {
        kind: "badge" as const,
        id: badge.id,
        title: badge.name,
        detail: `${badge.evidenceModuleIds.length} evidence module${
          badge.evidenceModuleIds.length === 1 ? "" : "s"
        }`,
        disposition,
      };
    }),
  ];
}

export interface ProgressReconciliationPackage {
  format: "project42/progress-reconciliation";
  formatVersion: "1.0";
  generatedAt: string;
  importId: string;
  state: "preview" | "pending" | "completed";
  mergeBehavior: {
    accountOnlyEvidenceRetained: true;
    identicalEvidenceKeptOnce: true;
    conflictingImmutableEvidenceBlocksImport: boolean;
    replaceAvailable: false;
    replaceWouldRemove: ProgressMigrationCounts;
  };
  summary: {
    browser: ProgressMigrationCounts;
    account: ProgressMigrationCounts;
    afterMerge: ProgressMigrationCounts;
    browserAdditions: ProgressMigrationCounts;
  };
  items: ProgressMigrationItem[];
  conflicts: ProgressMigrationConflict[];
  transcriptProjection: ReturnType<typeof buildTranscript>;
  records: {
    browser: ReturnType<typeof buildPortableLearnerRecord>;
    account: ReturnType<typeof buildPortableLearnerRecord>;
    proposedMerge: ReturnType<typeof buildPortableLearnerRecord>;
  };
}

export function buildProgressReconciliationPackage(
  preview: ProgressMigrationPreview,
  catalog: Catalog,
  input: {
    generatedAt: string;
    importId: string;
    state: ProgressReconciliationPackage["state"];
  },
): ProgressReconciliationPackage {
  return {
    format: "project42/progress-reconciliation",
    formatVersion: "1.0",
    generatedAt: input.generatedAt,
    importId: input.importId,
    state: input.state,
    mergeBehavior: {
      accountOnlyEvidenceRetained: true,
      identicalEvidenceKeptOnce: true,
      conflictingImmutableEvidenceBlocksImport:
        preview.conflicts.length > 0,
      replaceAvailable: false,
      replaceWouldRemove: preview.remoteOnly,
    },
    summary: {
      browser: preview.local,
      account: preview.remote,
      afterMerge: preview.merged,
      browserAdditions: preview.localAdditions,
    },
    items: buildProgressMigrationItems(preview, catalog),
    conflicts: structuredClone(preview.conflicts),
    transcriptProjection: buildTranscript(catalog, preview.mergedProgress),
    records: {
      browser: buildPortableLearnerRecord(
        catalog,
        preview.localProgress,
        input.generatedAt,
      ),
      account: buildPortableLearnerRecord(
        catalog,
        preview.remoteProgress,
        input.generatedAt,
      ),
      proposedMerge: buildPortableLearnerRecord(
        catalog,
        preview.mergedProgress,
        input.generatedAt,
      ),
    },
  };
}

interface ProgressMigrationRecoveryBase {
  schemaVersion: 1;
  importId: string;
  localProgress: LearnerProgress;
  remoteProgress: LearnerProgress;
  mergedProgress: LearnerProgress;
  createdAt: string;
}

export interface PendingProgressMigrationRecoveryEnvelope
  extends ProgressMigrationRecoveryBase {
  state: "pending";
  completedAt?: never;
  verifiedExportAt?: never;
  verifiedRevision?: never;
}

export interface CompletedProgressMigrationRecoveryEnvelope
  extends ProgressMigrationRecoveryBase {
  state: "completed";
  completedAt: string;
  verifiedExportAt?: string;
  verifiedRevision?: number;
}

export type ProgressMigrationRecoveryEnvelope =
  | PendingProgressMigrationRecoveryEnvelope
  | CompletedProgressMigrationRecoveryEnvelope;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const progressMigrationRecoveryProperties = new Set([
  "schemaVersion",
  "importId",
  "localProgress",
  "remoteProgress",
  "mergedProgress",
  "state",
  "createdAt",
  "completedAt",
  "verifiedExportAt",
  "verifiedRevision",
]);

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return (
    !Number.isNaN(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

export async function parseProgressMigrationRecovery(
  value: unknown,
  catalog: Catalog,
): Promise<ProgressMigrationRecoveryEnvelope | null> {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (property) => !progressMigrationRecoveryProperties.has(property),
    ) ||
    value.schemaVersion !== 1 ||
    typeof value.importId !== "string" ||
    !/^browser-local-v1-[0-9a-f]{64}$/.test(value.importId) ||
    (value.state !== "pending" && value.state !== "completed")
  ) {
    return null;
  }
  const local = validateDeviceLocalProgressValue(value.localProgress, catalog);
  const remote = validateDeviceLocalProgressValue(value.remoteProgress, catalog);
  const merged = validateDeviceLocalProgressValue(value.mergedProgress, catalog);
  if (!local.valid || !remote.valid || !merged.valid) return null;
  const expectedMerge = createProgressMigrationPreview(
    local.progress,
    remote.progress,
  ).mergedProgress;
  if (
    canonicalProgressValue(merged.progress) !==
    canonicalProgressValue(expectedMerge)
  ) {
    return null;
  }
  if ((await createProgressImportId(local.progress)) !== value.importId) {
    return null;
  }
  if (!isCanonicalIsoTimestamp(value.createdAt)) return null;
  if (
    (value.completedAt !== undefined &&
      !isCanonicalIsoTimestamp(value.completedAt)) ||
    (value.verifiedExportAt !== undefined &&
      !isCanonicalIsoTimestamp(value.verifiedExportAt)) ||
    (value.verifiedRevision !== undefined &&
      (typeof value.verifiedRevision !== "number" ||
        !Number.isInteger(value.verifiedRevision) ||
        value.verifiedRevision < 1))
  ) {
    return null;
  }
  if (
    (value.verifiedExportAt === undefined) !==
    (value.verifiedRevision === undefined)
  ) {
    return null;
  }
  const base: ProgressMigrationRecoveryBase = {
    schemaVersion: 1,
    importId: value.importId,
    localProgress: local.progress,
    remoteProgress: remote.progress,
    mergedProgress: merged.progress,
    createdAt: value.createdAt,
  };
  if (value.state === "pending") {
    if (
      value.completedAt !== undefined ||
      value.verifiedExportAt !== undefined ||
      value.verifiedRevision !== undefined
    ) {
      return null;
    }
    return { ...base, state: "pending" };
  }
  if (
    !isCanonicalIsoTimestamp(value.completedAt) ||
    Date.parse(value.completedAt) < Date.parse(value.createdAt) ||
    (value.verifiedExportAt !== undefined &&
      Date.parse(value.verifiedExportAt) < Date.parse(value.completedAt))
  ) {
    return null;
  }
  return {
    ...base,
    state: "completed",
    completedAt: value.completedAt,
    ...(value.verifiedExportAt !== undefined
      ? { verifiedExportAt: value.verifiedExportAt }
      : {}),
    ...(value.verifiedRevision !== undefined
      ? { verifiedRevision: value.verifiedRevision }
      : {}),
  };
}

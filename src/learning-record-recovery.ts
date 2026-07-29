import {
  LearningEventEngine,
  type LearningEventAccess,
  type LearningEventCandidate,
  type LearningEventStore,
  type LearningProjection,
} from "./learning-event-engine.js";
import type { LearningCommand } from "./learning-events.js";
import type { LearningRecordAdapterKind } from "./learning-record-adapter.js";
import {
  createLearningRecordRecoveryBackup,
  type LearningRecordRecoveryBackupArtifact,
  verifyLearningRecordRecoveryBackup,
} from "./learning-record-recovery-backup.js";
import {
  type LearningRecordDeletionReceipt,
  type LearningRecordReceiptStore,
  type VerifiedLearningRecordExport,
  verifyLearningRecordDeletionReplay,
  verifyLearningRecordExport,
} from "./learning-record-receipts.js";

export const LEARNING_RECORD_RECOVERY_CONTRACT_VERSION = "1.1" as const;
export const DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES = Object.freeze({
  maximumRecoveryPointSeconds: 24 * 60 * 60,
  maximumRecoveryTimeSeconds: 8 * 60 * 60,
});

export interface LearningRecordRecoveryScope {
  installationId: string;
  retainedLearnerId: string;
  deletedLearnerId: string;
  keyPrefix?: string;
  adapter?: LearningRecordAdapterKind;
  migrationHead?: string;
}

export interface LearningRecordRecoveryMeasurement {
  backupCapturedAt: string;
  sourceCurrentAt: string;
  recoveryStartedAt: string;
  recoveryCompletedAt: string;
  maximumRecoveryPointSeconds: number;
  maximumRecoveryTimeSeconds: number;
}

export interface MeasuredLearningRecordRecoveryOptions {
  backupCapturedAt: string;
  sourceCurrentAt: string;
  maximumRecoveryPointSeconds?: number;
  maximumRecoveryTimeSeconds?: number;
  now?: () => string;
}

export interface LearningRecordRecoveryReport {
  contractVersion: typeof LEARNING_RECORD_RECOVERY_CONTRACT_VERSION;
  promotionStatus: "ready";
  checks: string[];
  adapter: LearningRecordAdapterKind;
  migrationHead: string;
  backupId: string;
  backupSha256: string;
  backupBytes: number;
  restoredEventCount: number;
  replayedDeletionEventCount: number;
  deletionReceiptStatus: "verified";
  deletionReplayStatus: "verified";
  retainedTranscriptEntries: number;
  retainedBadges: number;
  retainedAttempts: number;
  retainedCorrections: number;
  preBackupProjectionSha256: string;
  rebuiltProjectionSha256: string;
  recoveryPointSeconds: number;
  recoveryTimeSeconds: number;
  maximumRecoveryPointSeconds: number;
  maximumRecoveryTimeSeconds: number;
}

export async function restoreVerifiedLearningRecordExport(
  store: LearningEventStore,
  exported: VerifiedLearningRecordExport,
): Promise<number> {
  const validation = await verifyLearningRecordExport(exported);
  if (!validation.valid) {
    throw new Error(
      `Learning-record backup verification failed: ${validation.errors.join("; ")}`,
    );
  }
  const current = await store.list(
    exported.installationId,
    exported.learnerId,
  );
  if (current.length !== 0) {
    throw new Error(
      "Learning-record restore target must be an empty learner stream.",
    );
  }
  try {
    let previousSequence = 0;
    for (const [index, event] of exported.events.entries()) {
      const { sequence: _sequence, ...candidate } = event;
      const result = await store.append(
        candidate as LearningEventCandidate,
        index,
      );
      if (
        result.replayed ||
        result.event.sequence <= previousSequence
      ) {
        throw new Error(
          "Learning-record restore did not reproduce the authoritative event order.",
        );
      }
      previousSequence = result.event.sequence;
    }
    const restored = await store.list(
      exported.installationId,
      exported.learnerId,
    );
    assertRestoredEventSemantics(exported.events, restored);
    return restored.length;
  } catch (error) {
    try {
      await store.delete(exported.installationId, exported.learnerId);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Learning-record restore failed and its isolated target could not be cleared.",
      );
    }
    throw error;
  }
}

export function measureLearningRecordRecovery(
  measurement: LearningRecordRecoveryMeasurement,
): {
  recoveryPointSeconds: number;
  recoveryTimeSeconds: number;
} {
  const backupCapturedAt = timestamp(
    measurement.backupCapturedAt,
    "backupCapturedAt",
  );
  const sourceCurrentAt = timestamp(
    measurement.sourceCurrentAt,
    "sourceCurrentAt",
  );
  const recoveryStartedAt = timestamp(
    measurement.recoveryStartedAt,
    "recoveryStartedAt",
  );
  const recoveryCompletedAt = timestamp(
    measurement.recoveryCompletedAt,
    "recoveryCompletedAt",
  );
  const recoveryPointSeconds = elapsedSeconds(
    backupCapturedAt,
    sourceCurrentAt,
    "sourceCurrentAt must not precede backupCapturedAt",
  );
  const recoveryTimeSeconds = elapsedSeconds(
    recoveryStartedAt,
    recoveryCompletedAt,
    "recoveryCompletedAt must not precede recoveryStartedAt",
  );
  if (recoveryStartedAt < sourceCurrentAt) {
    throw new Error(
      "recoveryStartedAt must not precede sourceCurrentAt.",
    );
  }
  assertObjective(
    measurement.maximumRecoveryPointSeconds,
    "maximumRecoveryPointSeconds",
  );
  assertObjective(
    measurement.maximumRecoveryTimeSeconds,
    "maximumRecoveryTimeSeconds",
  );
  if (recoveryPointSeconds > measurement.maximumRecoveryPointSeconds) {
    throw new Error(
      `Recovery point objective exceeded: ${recoveryPointSeconds}s > ` +
        `${measurement.maximumRecoveryPointSeconds}s.`,
    );
  }
  if (recoveryTimeSeconds > measurement.maximumRecoveryTimeSeconds) {
    throw new Error(
      `Recovery time objective exceeded: ${recoveryTimeSeconds}s > ` +
        `${measurement.maximumRecoveryTimeSeconds}s.`,
    );
  }
  return { recoveryPointSeconds, recoveryTimeSeconds };
}

export async function runLearningRecordRecoveryConformance(
  sourceStore: LearningEventStore & LearningRecordReceiptStore,
  restoredStore: LearningEventStore & LearningRecordReceiptStore,
  scope: LearningRecordRecoveryScope,
  measurement: LearningRecordRecoveryMeasurement,
): Promise<LearningRecordRecoveryReport> {
  return runLearningRecordRecoveryConformanceInternal(
    sourceStore,
    restoredStore,
    scope,
    measurement,
  );
}

export async function runMeasuredLearningRecordRecoveryConformance(
  sourceStore: LearningEventStore & LearningRecordReceiptStore,
  restoredStore: LearningEventStore & LearningRecordReceiptStore,
  scope: LearningRecordRecoveryScope,
  options: MeasuredLearningRecordRecoveryOptions,
): Promise<LearningRecordRecoveryReport> {
  const now = options.now ?? (() => new Date().toISOString());
  const maximumRecoveryPointSeconds =
    options.maximumRecoveryPointSeconds ??
    DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES.maximumRecoveryPointSeconds;
  const maximumRecoveryTimeSeconds =
    options.maximumRecoveryTimeSeconds ??
    DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES.maximumRecoveryTimeSeconds;
  return runLearningRecordRecoveryConformanceInternal(
    sourceStore,
    restoredStore,
    scope,
    {
      backupCapturedAt: options.backupCapturedAt,
      sourceCurrentAt: options.sourceCurrentAt,
      recoveryStartedAt: options.sourceCurrentAt,
      recoveryCompletedAt: options.sourceCurrentAt,
      maximumRecoveryPointSeconds,
      maximumRecoveryTimeSeconds,
    },
    now,
  );
}

async function runLearningRecordRecoveryConformanceInternal(
  sourceStore: LearningEventStore & LearningRecordReceiptStore,
  restoredStore: LearningEventStore & LearningRecordReceiptStore,
  scope: LearningRecordRecoveryScope,
  measurement: LearningRecordRecoveryMeasurement,
  recoveryClock?: () => string,
): Promise<LearningRecordRecoveryReport> {
  const recoveryStartedAt =
    recoveryClock?.() ?? measurement.recoveryStartedAt;
  measureLearningRecordRecovery({
    ...measurement,
    recoveryStartedAt,
    recoveryCompletedAt: recoveryClock
      ? recoveryStartedAt
      : measurement.recoveryCompletedAt,
  });
  const prefix = scope.keyPrefix ?? "recovery-conformance";
  const adapter = scope.adapter ?? "cloudflare-d1";
  const migrationHead =
    scope.migrationHead ??
    (adapter === "cloudflare-d1"
      ? "0011_authoritative_progress_imports.sql"
      : "008_authoritative_progress_imports.sql");
  await assertEmptyScope(sourceStore, scope);
  await assertEmptyScope(restoredStore, scope);

  const sourceEngine = new LearningEventEngine(sourceStore, {
    now: () => measurement.backupCapturedAt,
  });
  const restoredEngine = new LearningEventEngine(restoredStore, {
    now: () => recoveryStartedAt,
  });
  const retainedAccess = learnerAccess(
    scope.installationId,
    scope.retainedLearnerId,
  );
  const deletedAccess = learnerAccess(
    scope.installationId,
    scope.deletedLearnerId,
  );

  await seedCompletedPath(
    sourceEngine,
    retainedAccess,
    `${prefix}-retained`,
    "retained",
  );
  await seedCompletedPath(
    sourceEngine,
    deletedAccess,
    `${prefix}-deleted`,
    "deleted",
  );

  const retainedProjectionBeforeBackup = await sourceEngine.rebuild(
    scope.installationId,
    scope.retainedLearnerId,
    retainedAccess,
  );
  const retainedBackup = await sourceEngine.exportVerified(
    scope.installationId,
    scope.retainedLearnerId,
    retainedAccess,
    measurement.backupCapturedAt,
  );
  const deletedBackup = await sourceEngine.exportVerified(
    scope.installationId,
    scope.deletedLearnerId,
    deletedAccess,
    measurement.backupCapturedAt,
  );
  await assertValidBackup(retainedBackup);
  await assertValidBackup(deletedBackup);
  const recoveryBackup = await createLearningRecordRecoveryBackup(
    [retainedBackup, deletedBackup],
    {
      adapter,
      migrationHead,
      capturedAt: measurement.backupCapturedAt,
      sourceCurrentAt: measurement.sourceCurrentAt,
    },
  );
  const verifiedRecoveryBackup =
    await verifyLearningRecordRecoveryBackup(recoveryBackup, {
      adapter,
      migrationHead,
    });
  await assertInvalidRecoveryBackupsFail(recoveryBackup, {
    adapter,
    migrationHead,
  });

  const deletionReceipt = await sourceEngine.deleteVerified(
    scope.installationId,
    scope.deletedLearnerId,
    `${prefix}-post-backup-deletion-0001`,
    deletedAccess,
    measurement.sourceCurrentAt,
  );

  const verifiedRetainedBackup = requiredBackupStream(
    verifiedRecoveryBackup.streams,
    scope.retainedLearnerId,
  );
  const verifiedDeletedBackup = requiredBackupStream(
    verifiedRecoveryBackup.streams,
    scope.deletedLearnerId,
  );
  const restoredEventCount =
    (await restoreVerifiedLearningRecordExport(
      restoredStore,
      verifiedRetainedBackup,
    )) +
    (await restoreVerifiedLearningRecordExport(
      restoredStore,
      verifiedDeletedBackup,
    ));
  const retainedProjectionAfterRestore = await restoredEngine.rebuild(
    scope.installationId,
    scope.retainedLearnerId,
    retainedAccess,
  );
  assertProjectionMatch(
    retainedProjectionBeforeBackup,
    retainedProjectionAfterRestore,
  );
  const preBackupProjectionSha256 = await digestProjection(
    retainedProjectionBeforeBackup,
  );
  const rebuiltProjectionSha256 = await digestProjection(
    retainedProjectionAfterRestore,
  );
  if (preBackupProjectionSha256 !== rebuiltProjectionSha256) {
    throw new Error(
      "Rebuilt learning projection digest does not match pre-backup evidence.",
    );
  }

  const replay = await replayPostBackupDeletion(
    restoredEngine,
    restoredStore,
    scope,
    deletionReceipt,
    `${prefix}-restore-0001`,
    deletedAccess,
    recoveryStartedAt,
  );
  const recoveryCompletedAt =
    recoveryClock?.() ?? measurement.recoveryCompletedAt;
  const recovery = measureLearningRecordRecovery({
    ...measurement,
    recoveryStartedAt,
    recoveryCompletedAt,
  });

  return {
    contractVersion: LEARNING_RECORD_RECOVERY_CONTRACT_VERSION,
    promotionStatus: "ready",
    checks: [
      "verified-backup-before-write",
      "backup-manifest-checksum-verified",
      "corrupt-backup-rejected",
      "incomplete-backup-rejected",
      "truncated-backup-rejected",
      "checksum-mismatched-backup-rejected",
      "wrong-migration-head-rejected",
      "authoritative-event-order-restored",
      "enrollment-progress-attempt-correction-projections-rebuilt",
      "transcript-projection-rebuilt",
      "badge-projection-rebuilt",
      "post-backup-deletion-replayed",
      "deleted-stream-empty-before-promotion",
      "recovery-point-objective-met",
      "recovery-time-objective-met",
    ],
    adapter,
    migrationHead,
    backupId: verifiedRecoveryBackup.manifest.backupId,
    backupSha256: verifiedRecoveryBackup.manifest.payloadSha256,
    backupBytes: verifiedRecoveryBackup.manifest.payloadBytes,
    restoredEventCount,
    replayedDeletionEventCount: replay.deletedEventCount,
    deletionReceiptStatus: "verified",
    deletionReplayStatus: "verified",
    retainedTranscriptEntries:
      retainedProjectionAfterRestore.transcript.length,
    retainedBadges: retainedProjectionAfterRestore.badges.length,
    retainedAttempts: retainedProjectionAfterRestore.attempts.length,
    retainedCorrections: retainedProjectionAfterRestore.attempts.reduce(
      (total, attempt) => total + attempt.corrections.length,
      0,
    ),
    preBackupProjectionSha256,
    rebuiltProjectionSha256,
    recoveryPointSeconds: recovery.recoveryPointSeconds,
    recoveryTimeSeconds: recovery.recoveryTimeSeconds,
    maximumRecoveryPointSeconds:
      measurement.maximumRecoveryPointSeconds,
    maximumRecoveryTimeSeconds:
      measurement.maximumRecoveryTimeSeconds,
  };
}

async function replayPostBackupDeletion(
  engine: LearningEventEngine,
  store: LearningEventStore,
  scope: LearningRecordRecoveryScope,
  receipt: LearningRecordDeletionReceipt,
  restoreId: string,
  access: LearningEventAccess,
  replayedAt: string,
) {
  const replay = await engine.replayDeletion(
    scope.installationId,
    scope.deletedLearnerId,
    receipt,
    restoreId,
    access,
    replayedAt,
  );
  const validation = await verifyLearningRecordDeletionReplay(replay);
  if (!validation.valid) {
    throw new Error(
      `Deletion replay verification failed: ${validation.errors.join("; ")}`,
    );
  }
  const remaining = await store.list(
    scope.installationId,
    scope.deletedLearnerId,
  );
  if (remaining.length !== 0) {
    throw new Error(
      "Deletion replay left restored learner events available for promotion.",
    );
  }
  return replay;
}

async function assertEmptyScope(
  store: LearningEventStore,
  scope: LearningRecordRecoveryScope,
): Promise<void> {
  for (const learnerId of [
    scope.retainedLearnerId,
    scope.deletedLearnerId,
  ]) {
    if ((await store.list(scope.installationId, learnerId)).length !== 0) {
      throw new Error(
        "Learning-record recovery conformance requires isolated empty streams.",
      );
    }
  }
}

async function assertValidBackup(
  backup: VerifiedLearningRecordExport,
): Promise<void> {
  const validation = await verifyLearningRecordExport(backup);
  if (!validation.valid) {
    throw new Error(
      `Learning-record backup verification failed: ${validation.errors.join("; ")}`,
    );
  }
}

async function assertInvalidRecoveryBackupsFail(
  backup: LearningRecordRecoveryBackupArtifact,
  expected: {
    adapter: LearningRecordAdapterKind;
    migrationHead: string;
  },
): Promise<void> {
  const checksumMismatch = structuredClone(backup);
  checksumMismatch.payload = `${checksumMismatch.payload} `;
  await assertRejectedBackup(checksumMismatch, expected, "checksum-mismatched");

  const truncated = structuredClone(backup);
  truncated.payload = truncated.payload.slice(
    0,
    Math.max(1, truncated.payload.length - 17),
  );
  truncated.manifest.payloadBytes = new TextEncoder().encode(
    truncated.payload,
  ).byteLength;
  truncated.manifest.payloadSha256 = await digestText(truncated.payload);
  truncated.manifest.backupId =
    `learning-recovery-${truncated.manifest.payloadSha256.slice(0, 32)}`;
  await assertRejectedBackup(truncated, expected, "truncated");

  const corruptPayload = JSON.parse(backup.payload) as {
    streams: VerifiedLearningRecordExport[];
  };
  const firstEvent = corruptPayload.streams[0]?.events[0];
  if (!firstEvent || firstEvent.type !== "path.enrolled") {
    throw new Error("Recovery fixture is missing its enrollment event.");
  }
  firstEvent.payload.pathTitle = "Corrupted after backup";
  const corrupt = await resignBackupPayload(backup, corruptPayload);
  await assertRejectedBackup(corrupt, expected, "corrupt");

  const incompletePayload = JSON.parse(backup.payload) as {
    streams: VerifiedLearningRecordExport[];
  };
  incompletePayload.streams[0]?.events.pop();
  const incomplete = await resignBackupPayload(backup, incompletePayload);
  await assertRejectedBackup(incomplete, expected, "incomplete");

  const wrongHead = structuredClone(backup);
  wrongHead.manifest.migrationHead = expected.adapter === "cloudflare-d1"
    ? "0010_wrong_head.sql"
    : "007_wrong_head.sql";
  await assertRejectedBackup(wrongHead, expected, "wrong migration head");
}

function assertProjectionMatch(
  expected: LearningProjection,
  actual: LearningProjection,
): void {
  const {
    lastSequence: _expectedLastSequence,
    ...expectedSemantics
  } = expected;
  const {
    lastSequence: _actualLastSequence,
    ...actualSemantics
  } = actual;
  if (JSON.stringify(actualSemantics) !== JSON.stringify(expectedSemantics)) {
    throw new Error(
      "Rebuilt enrollment, progress, attempt, correction, transcript, or badge projection does not match authoritative evidence.",
    );
  }
}

function assertRestoredEventSemantics(
  expected: VerifiedLearningRecordExport["events"],
  actual: VerifiedLearningRecordExport["events"],
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      "Restored learning-event count does not match authoritative evidence.",
    );
  }
  for (const [index, expectedEvent] of expected.entries()) {
    const actualEvent = actual[index];
    if (!actualEvent) {
      throw new Error("Restored learning-event order is incomplete.");
    }
    const {
      sequence: _expectedSequence,
      ...expectedSemantics
    } = expectedEvent;
    const {
      sequence: _actualSequence,
      ...actualSemantics
    } = actualEvent;
    if (JSON.stringify(actualSemantics) !== JSON.stringify(expectedSemantics)) {
      throw new Error(
        "Restored learning-event semantics or authoritative order changed.",
      );
    }
  }
}

function requiredBackupStream(
  streams: VerifiedLearningRecordExport[],
  learnerId: string,
): VerifiedLearningRecordExport {
  const matching = streams.filter((stream) => stream.learnerId === learnerId);
  if (matching.length !== 1) {
    throw new Error(
      "Verified recovery backup must contain exactly one required learner stream.",
    );
  }
  return matching[0] as VerifiedLearningRecordExport;
}

async function digestProjection(
  projection: LearningProjection,
): Promise<string> {
  const { lastSequence: _lastSequence, ...semantics } = projection;
  return digestText(JSON.stringify(sortJsonValue(semantics)));
}

async function resignBackupPayload(
  original: LearningRecordRecoveryBackupArtifact,
  payloadValue: unknown,
): Promise<LearningRecordRecoveryBackupArtifact> {
  const changed = structuredClone(original);
  changed.payload = JSON.stringify(payloadValue);
  changed.manifest.payloadBytes = new TextEncoder().encode(
    changed.payload,
  ).byteLength;
  changed.manifest.payloadSha256 = await digestText(changed.payload);
  changed.manifest.backupId =
    `learning-recovery-${changed.manifest.payloadSha256.slice(0, 32)}`;
  return changed;
}

async function assertRejectedBackup(
  backup: LearningRecordRecoveryBackupArtifact,
  expected: {
    adapter: LearningRecordAdapterKind;
    migrationHead: string;
  },
  label: string,
): Promise<void> {
  try {
    await verifyLearningRecordRecoveryBackup(backup, expected);
  } catch {
    return;
  }
  throw new Error(`A ${label} learning-record backup passed verification.`);
}

function learnerAccess(
  installationId: string,
  learnerId: string,
): LearningEventAccess {
  return {
    installationId,
    actorType: "learner",
    actorUserId: learnerId,
    permissions: [
      "learning:write:self",
      "learning:read:self",
      "learning:delete:self",
    ],
  };
}

async function seedCompletedPath(
  engine: LearningEventEngine,
  access: LearningEventAccess,
  prefix: string,
  label: string,
): Promise<void> {
  const learnerId = access.actorUserId;
  if (!learnerId) throw new Error("Recovery learner identity is required.");
  const common = {
    schemaVersion: "1.0" as const,
    installationId: access.installationId,
    learnerId,
    contentVersion: "recovery-conformance-1.0.0",
    actor: { type: "learner" as const, userId: learnerId },
  };
  const commands: LearningCommand[] = [
    {
      ...common,
      type: "path.enroll",
      idempotencyKey: `${prefix}-enroll-0001`,
      occurredAt: "2026-07-28T16:00:00.000Z",
      payload: {
        pathId: `${label}-recovery-path`,
        pathTitle: `${label} recovery path`,
        moduleIds: [`${label}-module`],
        badge: {
          id: `${label}-badge`,
          name: `${label} recovery badge`,
          description: "Recovery projection evidence.",
        },
      },
    },
    {
      ...common,
      type: "assessment.record",
      idempotencyKey: `${prefix}-assessment-0001`,
      occurredAt: "2026-07-28T16:01:00.000Z",
      payload: {
        attemptId: `${prefix}-attempt-0001`,
        pathId: `${label}-recovery-path`,
        moduleId: `${label}-module`,
        assessmentVersion: "1.0.0",
        answers: { "recovery-question": 1 },
        scorePercent: 100,
        passed: true,
      },
    },
    {
      ...common,
      type: "assessment.correct",
      idempotencyKey: `${prefix}-correction-0001`,
      occurredAt: "2026-07-28T16:02:00.000Z",
      actor: {
        type: "owner",
        userId: `${prefix}-recovery-owner`,
      },
      payload: {
        correctionId: `${prefix}-correction-0001`,
        attemptId: `${prefix}-attempt-0001`,
        assessmentVersion: "1.0.0",
        scorePercent: 90,
        passed: true,
        reason: "Recovery evidence preserves the original attempt and correction.",
      },
    },
    {
      ...common,
      type: "module.complete",
      idempotencyKey: `${prefix}-complete-0001`,
      occurredAt: "2026-07-28T16:03:00.000Z",
      payload: {
        pathId: `${label}-recovery-path`,
        moduleId: `${label}-module`,
        evidenceRefs: [`recovery:${label}:module`],
      },
    },
  ];
  for (const command of commands) {
    const commandAccess =
      command.type === "assessment.correct"
        ? {
            installationId: access.installationId,
            actorType: "owner" as const,
            actorUserId: command.actor.userId,
            permissions: [
              "learning:write:any" as const,
              "learning:read:any" as const,
              "learning:delete:any" as const,
            ],
          }
        : access;
    await engine.execute(command, commandAccess);
  }
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(parsed)
  ) {
    throw new Error(`${name} must be a valid ISO UTC timestamp.`);
  }
  return parsed;
}

function elapsedSeconds(
  earlier: number,
  later: number,
  error: string,
): number {
  if (later < earlier) throw new Error(error);
  return (later - earlier) / 1000;
}

function assertObjective(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
}

async function digestText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }
  return value;
}

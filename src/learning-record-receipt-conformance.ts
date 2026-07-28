import {
  LearningEventEngine,
  LearningEventEngineError,
  type LearningEventAccess,
  type LearningEventStore,
} from "./learning-event-engine.js";
import type { LearningCommand } from "./learning-events.js";
import {
  type LearningRecordReceiptStore,
  verifyLearningRecordDeletionReceipt,
  verifyLearningRecordDeletionReplay,
  verifyLearningRecordExport,
} from "./learning-record-receipts.js";

export interface LearningRecordReceiptConformanceScope {
  installationId: string;
  learnerId: string;
  keyPrefix?: string;
}

export interface LearningRecordReceiptConformanceReport {
  contractVersion: "1.0";
  checks: string[];
  exportedEventCount: number;
  deletedEventCount: number;
  replayedEventCount: number;
}

export async function runLearningRecordReceiptConformance(
  store: LearningEventStore & LearningRecordReceiptStore,
  scope: LearningRecordReceiptConformanceScope,
): Promise<LearningRecordReceiptConformanceReport> {
  const prefix = scope.keyPrefix ?? "receipt-conformance";
  const access: LearningEventAccess = {
    installationId: scope.installationId,
    actorType: "learner",
    actorUserId: scope.learnerId,
    permissions: [
      "learning:write:self",
      "learning:read:self",
      "learning:delete:self",
    ],
  };
  const engine = new LearningEventEngine(store, {
    now: () => "2026-07-28T18:00:00.000Z",
  });
  const commands = createCommands(scope, prefix);
  for (const command of commands) await engine.execute(command, access);

  const exported = await engine.exportVerified(
    scope.installationId,
    scope.learnerId,
    access,
    "2026-07-28T18:01:00.000Z",
  );
  expect(
    (await verifyLearningRecordExport(exported)).valid,
    "Verified export failed its own digest check.",
  );

  await expectAccessDenied(() =>
    engine.exportVerified(
      scope.installationId,
      scope.learnerId,
      { ...access, actorUserId: `${prefix}-another-learner` },
      "2026-07-28T18:01:00.000Z",
    ),
  );

  const operationKey = `${prefix}-delete-operation-0001`;
  const deletion = await engine.deleteVerified(
    scope.installationId,
    scope.learnerId,
    operationKey,
    access,
    "2026-07-28T18:02:00.000Z",
  );
  expect(
    (
      await verifyLearningRecordDeletionReceipt(
        deletion,
        exported.events,
      )
    ).valid,
    "Deletion receipt did not bind the exported source evidence.",
  );
  const repeatedDeletion = await engine.deleteVerified(
    scope.installationId,
    scope.learnerId,
    operationKey,
    access,
    "2026-07-28T18:03:00.000Z",
  );
  expect(
    repeatedDeletion.id === deletion.id,
    "A retried deletion produced a second receipt.",
  );
  expect(
    (await store.list(scope.installationId, scope.learnerId)).length === 0,
    "Verified deletion left events behind.",
  );

  for (const command of commands) await engine.execute(command, access);
  const replay = await engine.replayDeletion(
    scope.installationId,
    scope.learnerId,
    deletion,
    `${prefix}-restore-0001`,
    access,
    "2026-07-28T18:04:00.000Z",
  );
  expect(
    (await verifyLearningRecordDeletionReplay(replay)).valid,
    "Deletion replay failed its own digest check.",
  );
  const repeatedReplay = await engine.replayDeletion(
    scope.installationId,
    scope.learnerId,
    deletion,
    `${prefix}-restore-0001`,
    access,
    "2026-07-28T18:05:00.000Z",
  );
  expect(
    repeatedReplay.id === replay.id,
    "A retried restore replay produced a second receipt.",
  );
  expect(
    (await store.list(scope.installationId, scope.learnerId)).length === 0,
    "Deletion replay left restored events behind.",
  );

  return {
    contractVersion: "1.0",
    checks: [
      "verified-export",
      "authorization-isolation",
      "idempotent-deletion-receipt",
      "pseudonymous-deletion-evidence",
      "idempotent-backup-replay",
    ],
    exportedEventCount: exported.events.length,
    deletedEventCount: deletion.eventCount,
    replayedEventCount: replay.deletedEventCount,
  };
}

function createCommands(
  scope: LearningRecordReceiptConformanceScope,
  prefix: string,
): LearningCommand[] {
  const common = {
    schemaVersion: "1.0" as const,
    installationId: scope.installationId,
    learnerId: scope.learnerId,
    contentVersion: "receipt-conformance-1.0.0",
    actor: { type: "learner" as const, userId: scope.learnerId },
  };
  return [
    {
      ...common,
      type: "path.enroll",
      idempotencyKey: `${prefix}-enroll-command-0001`,
      occurredAt: "2026-07-28T17:00:00.000Z",
      payload: {
        pathId: "receipt-path",
        pathTitle: "Receipt conformance",
        moduleIds: ["receipt-module"],
        badge: {
          id: "receipt-badge",
          name: "Receipt conformance",
          description: "Receipt adapter evidence.",
        },
      },
    },
    {
      ...common,
      type: "assessment.record",
      idempotencyKey: `${prefix}-assessment-command-0001`,
      occurredAt: "2026-07-28T17:01:00.000Z",
      payload: {
        attemptId: `${prefix}-attempt-0001`,
        pathId: "receipt-path",
        moduleId: "receipt-module",
        assessmentVersion: "1.0.0",
        answers: { "question-1": 0 },
        scorePercent: 0,
        passed: false,
      },
    },
  ];
}

async function expectAccessDenied(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (
      error instanceof LearningEventEngineError &&
      error.code === "access-denied"
    ) {
      return;
    }
    throw error;
  }
  throw new Error(
    "Learning-record receipt conformance expected access-denied.",
  );
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Learning-record receipt conformance failed: ${message}`);
  }
}

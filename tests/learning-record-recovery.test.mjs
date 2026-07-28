import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import Ajv2020 from "ajv/dist/2020.js";
import {
  measureLearningRecordRecovery,
  restoreVerifiedLearningRecordExport,
  runLearningRecordRecoveryConformance,
  SqlLearningEventStore,
} from "../dist/index.js";

async function applyD1Migrations(database) {
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
}

async function seedRecoveryPrincipals(database, installationId, learnerIds) {
  await database
    .prepare("INSERT INTO installations VALUES (?, ?, ?, ?)")
    .bind(
      installationId,
      "Recovery conformance",
      "2026-07-28T00:00:00.000Z",
      "2026-07-28T00:00:00.000Z",
    )
    .run();
  for (const learnerId of learnerIds) {
    await database
      .prepare(
        `INSERT INTO users (
           id, installation_id, display_name, primary_email,
           email_verified, account_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        learnerId,
        installationId,
        "Synthetic recovery learner",
        null,
        0,
        "approved",
        "2026-07-28T00:00:00.000Z",
        "2026-07-28T00:00:00.000Z",
      )
      .run();
  }
}

test("recovery gate restores projections and replays post-backup deletion", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: {
      SOURCE: "project42-recovery-source",
      RESTORED: "project42-recovery-restored",
      INVALID: "project42-recovery-invalid",
    },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());

  const sourceDatabase = await miniflare.getD1Database("SOURCE");
  const restoredDatabase = await miniflare.getD1Database("RESTORED");
  const invalidDatabase = await miniflare.getD1Database("INVALID");
  for (const database of [
    sourceDatabase,
    restoredDatabase,
    invalidDatabase,
  ]) {
    await applyD1Migrations(database);
  }

  const installationId = "recovery-conformance";
  const retainedLearnerId = "recovery-retained";
  const deletedLearnerId = "recovery-deleted";
  await seedRecoveryPrincipals(sourceDatabase, installationId, [
    retainedLearnerId,
    deletedLearnerId,
  ]);
  await seedRecoveryPrincipals(restoredDatabase, installationId, [
    retainedLearnerId,
    deletedLearnerId,
  ]);
  await seedRecoveryPrincipals(invalidDatabase, installationId, [
    retainedLearnerId,
  ]);

  const sourceStore = new SqlLearningEventStore(sourceDatabase);
  const restoredStore = new SqlLearningEventStore(restoredDatabase);
  const report = await runLearningRecordRecoveryConformance(
    sourceStore,
    restoredStore,
    {
      installationId,
      retainedLearnerId,
      deletedLearnerId,
      keyPrefix: "d1-recovery",
    },
    {
      backupCapturedAt: "2026-07-28T18:00:00.000Z",
      sourceCurrentAt: "2026-07-28T18:02:00.000Z",
      recoveryStartedAt: "2026-07-28T18:03:00.000Z",
      recoveryCompletedAt: "2026-07-28T18:03:01.500Z",
      maximumRecoveryPointSeconds: 300,
      maximumRecoveryTimeSeconds: 10,
    },
  );
  const reportSchema = JSON.parse(
    await readFile(
      new URL(
        "../schemas/learning/learning-record-recovery-report.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const validateReport = new Ajv2020({ strict: true }).compile(reportSchema);

  assert.equal(validateReport(report), true);
  assert.equal(report.contractVersion, "1.0");
  assert.equal(report.promotionStatus, "ready");
  assert.equal(report.restoredEventCount, 8);
  assert.equal(report.replayedDeletionEventCount, 4);
  assert.equal(report.retainedTranscriptEntries, 1);
  assert.equal(report.retainedBadges, 1);
  assert.equal(report.recoveryPointSeconds, 120);
  assert.equal(report.recoveryTimeSeconds, 1.5);
  assert.deepEqual(report.checks, [
    "verified-backup-before-write",
    "corrupt-backup-rejected",
    "incomplete-backup-rejected",
    "authoritative-event-order-restored",
    "enrollment-progress-attempt-correction-projections-rebuilt",
    "transcript-projection-rebuilt",
    "badge-projection-rebuilt",
    "post-backup-deletion-replayed",
    "deleted-stream-empty-before-promotion",
    "recovery-point-objective-met",
    "recovery-time-objective-met",
  ]);
  assert.equal(
    validateReport({ ...report, promotionStatus: "warning" }),
    false,
  );

  assert.equal(
    (await restoredStore.list(installationId, deletedLearnerId)).length,
    0,
  );
  assert.equal(
    (await restoredStore.list(installationId, retainedLearnerId)).length,
    4,
  );
  assert.equal(
    (
      await restoredDatabase
        .prepare("SELECT COUNT(*) AS count FROM learning_record_deletion_replays")
        .first()
    ).count,
    1,
  );

  const retainedBackup = await sourceStore.exportVerified(
    installationId,
    retainedLearnerId,
    "2026-07-28T18:05:00.000Z",
  );
  const corrupt = structuredClone(retainedBackup);
  corrupt.events[0].payload.pathTitle = "Tampered backup";
  const invalidStore = new SqlLearningEventStore(invalidDatabase);
  await assert.rejects(
    () => restoreVerifiedLearningRecordExport(invalidStore, corrupt),
    /backup verification failed/,
  );
  assert.equal(
    (await invalidStore.list(installationId, retainedLearnerId)).length,
    0,
  );

  const incomplete = structuredClone(retainedBackup);
  incomplete.events.pop();
  await assert.rejects(
    () => restoreVerifiedLearningRecordExport(invalidStore, incomplete),
    /backup verification failed/,
  );
  assert.equal(
    (await invalidStore.list(installationId, retainedLearnerId)).length,
    0,
  );

  let appendCalls = 0;
  const interruptedStore = {
    append: async (...arguments_) => {
      appendCalls += 1;
      if (appendCalls === 2) {
        throw new Error("Injected restore interruption");
      }
      return invalidStore.append(...arguments_);
    },
    list: (...arguments_) => invalidStore.list(...arguments_),
    delete: (...arguments_) => invalidStore.delete(...arguments_),
  };
  await assert.rejects(
    () =>
      restoreVerifiedLearningRecordExport(
        interruptedStore,
        retainedBackup,
      ),
    /Injected restore interruption/,
  );
  assert.equal(
    (await invalidStore.list(installationId, retainedLearnerId)).length,
    0,
  );

  assert.equal(
    await restoreVerifiedLearningRecordExport(invalidStore, retainedBackup),
    4,
  );
  await assert.rejects(
    () => restoreVerifiedLearningRecordExport(invalidStore, retainedBackup),
    /restore target must be an empty learner stream/,
  );
});

test("recovery measurements fail closed on chronology and objectives", () => {
  const base = {
    backupCapturedAt: "2026-07-28T18:00:00.000Z",
    sourceCurrentAt: "2026-07-28T18:02:00.000Z",
    recoveryStartedAt: "2026-07-28T18:03:00.000Z",
    recoveryCompletedAt: "2026-07-28T18:03:01.500Z",
    maximumRecoveryPointSeconds: 300,
    maximumRecoveryTimeSeconds: 10,
  };
  assert.deepEqual(measureLearningRecordRecovery(base), {
    recoveryPointSeconds: 120,
    recoveryTimeSeconds: 1.5,
  });
  assert.throws(
    () =>
      measureLearningRecordRecovery({
        ...base,
        maximumRecoveryPointSeconds: 60,
      }),
    /Recovery point objective exceeded/,
  );
  assert.throws(
    () =>
      measureLearningRecordRecovery({
        ...base,
        maximumRecoveryTimeSeconds: 1,
      }),
    /Recovery time objective exceeded/,
  );
  assert.throws(
    () =>
      measureLearningRecordRecovery({
        ...base,
        recoveryCompletedAt: "2026-07-28T18:02:59.000Z",
      }),
    /must not precede recoveryStartedAt/,
  );
  assert.throws(
    () =>
      measureLearningRecordRecovery({
        ...base,
        sourceCurrentAt: "2026-07-28T18:04:00.000Z",
      }),
    /recoveryStartedAt must not precede sourceCurrentAt/,
  );
});

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import Ajv2020 from "ajv/dist/2020.js";
import {
  createLearningRecordRecoveryBackup,
  DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES,
  measureLearningRecordRecovery,
  restoreVerifiedLearningRecordExport,
  runLearningRecordRecoveryConformance,
  runMeasuredLearningRecordRecoveryConformance,
  SqlLearningEventStore,
  verifyLearningRecordRecoveryBackup,
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
  assert.equal(report.contractVersion, "1.1");
  assert.equal(report.promotionStatus, "ready");
  assert.equal(report.adapter, "cloudflare-d1");
  assert.equal(report.migrationHead, "0011_authoritative_progress_imports.sql");
  assert.match(report.backupId, /^learning-recovery-[a-f0-9]{32}$/);
  assert.match(report.backupSha256, /^[a-f0-9]{64}$/);
  assert.ok(report.backupBytes > 0);
  assert.equal(report.restoredEventCount, 8);
  assert.equal(report.replayedDeletionEventCount, 4);
  assert.equal(report.deletionReceiptStatus, "verified");
  assert.equal(report.deletionReplayStatus, "verified");
  assert.equal(report.retainedTranscriptEntries, 1);
  assert.equal(report.retainedBadges, 1);
  assert.equal(report.retainedAttempts, 1);
  assert.equal(report.retainedCorrections, 1);
  assert.equal(
    report.preBackupProjectionSha256,
    report.rebuiltProjectionSha256,
  );
  assert.equal(report.recoveryPointSeconds, 120);
  assert.equal(report.recoveryTimeSeconds, 1.5);
  assert.deepEqual(report.checks, [
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
  const packagedBackup = await createLearningRecordRecoveryBackup(
    [retainedBackup],
    {
      adapter: "cloudflare-d1",
      migrationHead: "0011_authoritative_progress_imports.sql",
      capturedAt: "2026-07-28T18:05:00.000Z",
      sourceCurrentAt: "2026-07-28T18:05:01.000Z",
    },
  );
  const backupSchema = JSON.parse(
    await readFile(
      new URL(
        "../schemas/learning/learning-record-recovery-backup.schema.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const validateBackup = new Ajv2020({
    strict: true,
    validateFormats: false,
  }).compile(backupSchema);
  assert.equal(validateBackup(packagedBackup), true);
  assert.equal(
    (
      await verifyLearningRecordRecoveryBackup(packagedBackup, {
        adapter: "cloudflare-d1",
        migrationHead: "0011_authoritative_progress_imports.sql",
      })
    ).streams.length,
    1,
  );

  const checksumMismatch = structuredClone(packagedBackup);
  checksumMismatch.payload += " ";
  await assert.rejects(
    () =>
      verifyLearningRecordRecoveryBackup(checksumMismatch, {
        adapter: "cloudflare-d1",
        migrationHead: "0011_authoritative_progress_imports.sql",
      }),
    /byte count|checksum/,
  );
  const truncated = structuredClone(packagedBackup);
  truncated.payload = truncated.payload.slice(0, -15);
  truncated.manifest.payloadBytes = new TextEncoder().encode(
    truncated.payload,
  ).byteLength;
  const truncatedDigest = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(truncated.payload),
    ),
  ).toString("hex");
  truncated.manifest.payloadSha256 = truncatedDigest;
  truncated.manifest.backupId =
    `learning-recovery-${truncatedDigest.slice(0, 32)}`;
  await assert.rejects(
    () =>
      verifyLearningRecordRecoveryBackup(truncated, {
        adapter: "cloudflare-d1",
        migrationHead: "0011_authoritative_progress_imports.sql",
      }),
    /truncated or invalid JSON/,
  );
  await assert.rejects(
    () =>
      verifyLearningRecordRecoveryBackup(packagedBackup, {
        adapter: "cloudflare-d1",
        migrationHead: "0010_wrong_head.sql",
      }),
    /migration head/,
  );
  assert.equal(
    (await new SqlLearningEventStore(invalidDatabase).list(
      installationId,
      retainedLearnerId,
    )).length,
    0,
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

test("measured recovery gate brackets the actual restore operation", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: {
      SOURCE: "project42-measured-recovery-source",
      RESTORED: "project42-measured-recovery-restored",
    },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());

  const sourceDatabase = await miniflare.getD1Database("SOURCE");
  const restoredDatabase = await miniflare.getD1Database("RESTORED");
  for (const database of [sourceDatabase, restoredDatabase]) {
    await applyD1Migrations(database);
  }

  const installationId = "measured-recovery-conformance";
  const retainedLearnerId = "measured-recovery-retained";
  const deletedLearnerId = "measured-recovery-deleted";
  for (const database of [sourceDatabase, restoredDatabase]) {
    await seedRecoveryPrincipals(database, installationId, [
      retainedLearnerId,
      deletedLearnerId,
    ]);
  }

  const sourceStore = new SqlLearningEventStore(sourceDatabase);
  const restoredStore = new SqlLearningEventStore(restoredDatabase);
  const originalAppend = restoredStore.append.bind(restoredStore);
  let appendCalls = 0;
  restoredStore.append = async (...arguments_) => {
    appendCalls += 1;
    return originalAppend(...arguments_);
  };

  const clockTimes = [
    "2026-07-28T18:03:00.000Z",
    "2026-07-28T18:03:01.500Z",
  ];
  const appendCallsAtClockRead = [];
  const report = await runMeasuredLearningRecordRecoveryConformance(
    sourceStore,
    restoredStore,
    {
      installationId,
      retainedLearnerId,
      deletedLearnerId,
      keyPrefix: "measured-d1-recovery",
    },
    {
      backupCapturedAt: "2026-07-28T18:00:00.000Z",
      sourceCurrentAt: "2026-07-28T18:02:00.000Z",
      maximumRecoveryPointSeconds: 300,
      maximumRecoveryTimeSeconds: 10,
      now: () => {
        appendCallsAtClockRead.push(appendCalls);
        const next = clockTimes.shift();
        if (!next) throw new Error("Recovery clock was read too many times.");
        return next;
      },
    },
  );

  assert.deepEqual(appendCallsAtClockRead, [0, 8]);
  assert.equal(clockTimes.length, 0);
  assert.equal(report.promotionStatus, "ready");
  assert.equal(report.recoveryPointSeconds, 120);
  assert.equal(report.recoveryTimeSeconds, 1.5);
});

test("default recovery clock measures the 24-hour RPO and 8-hour RTO objectives", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: {
      SOURCE: "project42-default-clock-recovery-source",
      RESTORED: "project42-default-clock-recovery-restored",
    },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());

  const sourceDatabase = await miniflare.getD1Database("SOURCE");
  const restoredDatabase = await miniflare.getD1Database("RESTORED");
  for (const database of [sourceDatabase, restoredDatabase]) {
    await applyD1Migrations(database);
  }
  const installationId = "default-clock-recovery";
  const retainedLearnerId = "default-clock-retained";
  const deletedLearnerId = "default-clock-deleted";
  for (const database of [sourceDatabase, restoredDatabase]) {
    await seedRecoveryPrincipals(database, installationId, [
      retainedLearnerId,
      deletedLearnerId,
    ]);
  }

  const sourceCurrentAt = new Date().toISOString();
  const backupCapturedAt = new Date(
    Date.parse(sourceCurrentAt) - 60_000,
  ).toISOString();
  const report = await runMeasuredLearningRecordRecoveryConformance(
    new SqlLearningEventStore(sourceDatabase),
    new SqlLearningEventStore(restoredDatabase),
    {
      installationId,
      retainedLearnerId,
      deletedLearnerId,
      keyPrefix: "default-clock-d1-recovery",
    },
    { backupCapturedAt, sourceCurrentAt },
  );

  assert.equal(report.recoveryPointSeconds, 60);
  assert.ok(report.recoveryTimeSeconds >= 0);
  assert.ok(
    report.recoveryTimeSeconds <=
      DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES.maximumRecoveryTimeSeconds,
  );
  assert.equal(
    report.maximumRecoveryPointSeconds,
    DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES.maximumRecoveryPointSeconds,
  );
  assert.equal(
    report.maximumRecoveryTimeSeconds,
    DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES.maximumRecoveryTimeSeconds,
  );
  assert.equal(report.promotionStatus, "ready");
});

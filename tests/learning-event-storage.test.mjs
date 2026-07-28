import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  runLearningEventStoreConformance,
  runLearningRecordReceiptConformance,
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

test("D1 satisfies the published authoritative learning-event contract", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-learning-event-conformance" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  await database
    .prepare(
      "INSERT INTO installations VALUES (?, ?, ?, ?)",
    )
    .bind(
      "d1-conformance",
      "D1 conformance",
      "2026-07-28T00:00:00.000Z",
      "2026-07-28T00:00:00.000Z",
    )
    .run();
  await database
    .prepare(
      `INSERT INTO users (
         id, installation_id, display_name, primary_email,
         email_verified, account_state, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "d1-learner",
      "d1-conformance",
      "D1 learner",
      null,
      0,
      "approved",
      "2026-07-28T00:00:00.000Z",
      "2026-07-28T00:00:00.000Z",
    )
    .run();

  const report = await runLearningEventStoreConformance(
    new SqlLearningEventStore(database),
    {
      installationId: "d1-conformance",
      learnerId: "d1-learner",
      keyPrefix: "d1-contract",
    },
  );
  assert.equal(report.contractVersion, "1.1");
  assert.equal(report.eventCountBeforeDeletion, 7);
  assert.equal(report.deletedEventCount, 7);
  assert.deepEqual(report.checks, [
    "idempotent-retry",
    "idempotency-rebinding-denied",
    "concurrent-attempts",
    "immutable-original-attempt",
    "deterministic-rebuild",
    "transcript-badge-correction",
    "authoritative-progress-import",
    "authorization-isolation",
    "lossless-export",
    "governed-deletion",
  ]);

  const receiptReport = await runLearningRecordReceiptConformance(
    new SqlLearningEventStore(database),
    {
      installationId: "d1-conformance",
      learnerId: "d1-learner",
      keyPrefix: "d1-receipt-contract",
    },
  );
  assert.equal(receiptReport.exportedEventCount, 2);
  assert.equal(receiptReport.deletedEventCount, 2);
  assert.equal(receiptReport.replayedEventCount, 2);
  const deletionRows = await database
    .prepare(
      "SELECT scope_digest, operation_key FROM learning_record_deletion_receipts",
    )
    .all();
  assert.equal(deletionRows.results.length, 1);
  assert.match(deletionRows.results[0].scope_digest, /^[a-f0-9]{64}$/);
  assert.equal(
    JSON.stringify(deletionRows.results).includes("d1-learner"),
    false,
  );
  assert.equal(
    (
      await database
        .prepare("SELECT COUNT(*) AS count FROM learning_record_deletion_replays")
        .first()
    ).count,
    1,
  );
  await assert.rejects(
    () =>
      database
        .prepare(
          "UPDATE learning_record_deletion_receipts SET event_count = 0",
        )
        .run(),
    /learning record deletion receipts are immutable/,
  );
});

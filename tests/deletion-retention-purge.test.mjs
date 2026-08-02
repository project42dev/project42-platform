import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  DELETION_RECEIPT_RETAIN_DAYS,
  purgeExpiredDeletionReceipts,
} from "../dist/worker.js";

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

async function withDatabase(name, run) {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: name },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  try {
    const database = await miniflare.getD1Database("PROJECT42_DB");
    await applyD1Migrations(database);
    await run(database);
  } finally {
    await miniflare.dispose();
  }
}

async function insertTombstone(
  database,
  installationId,
  { id, completedAt, statusTokenDigest },
) {
  await database
    .prepare(
      `INSERT INTO deletion_tombstones (
         id, installation_id, subject_digest, deletion_request_id,
         requested_at, completed_at, completed_by_user_id,
         status_token_digest, cancellation_deadline
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      installationId,
      "0".repeat(64),
      `${id}-request`,
      "2020-01-01T00:00:00.000Z",
      completedAt,
      statusTokenDigest,
      "2020-01-08T00:00:00.000Z",
    )
    .run();
}

test("RR-03: the deletion-receipt retention window matches the declared policy class", () => {
  assert.equal(
    DELETION_RECEIPT_RETAIN_DAYS,
    90,
    "must match the deletion-receipt retention class in learner-data-policy.ts",
  );
});

test("RR-03: purgeExpiredDeletionReceipts clears the status token past the dispute window and keeps the append-only tombstone core", async () => {
  await withDatabase("deletion-receipt-purge", async (database) => {
    const installationId = "deletion-receipt-purge";
    await database
      .prepare(
        `INSERT INTO installations (id, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(installationId, "Purge test", "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z")
      .run();

    const oldTokenDigest = "a".repeat(64);
    const recentTokenDigest = "b".repeat(64);
    await insertTombstone(database, installationId, {
      id: "old-tombstone",
      completedAt: "2026-01-01T00:00:00.000Z", // well past 90 days before "now" below
      statusTokenDigest: oldTokenDigest,
    });
    await insertTombstone(database, installationId, {
      id: "recent-tombstone",
      completedAt: "2026-07-20T00:00:00.000Z", // within the window
      statusTokenDigest: recentTokenDigest,
    });

    const now = "2026-08-02T00:00:00.000Z";
    const result = await purgeExpiredDeletionReceipts(database, now);
    assert.equal(result.success, true);

    const rows = await database
      .prepare(
        `SELECT id, subject_digest, deletion_request_id, requested_at,
                completed_at, status_token_digest
           FROM deletion_tombstones
          WHERE installation_id = ?
          ORDER BY id`,
      )
      .bind(installationId)
      .all();
    const byId = Object.fromEntries(rows.results.map((row) => [row.id, row]));

    assert.equal(
      byId["old-tombstone"].status_token_digest,
      null,
      "the status token past the dispute window must be cleared",
    );
    // The append-only core survives even after the receipt token is cleared.
    assert.equal(byId["old-tombstone"].subject_digest, "0".repeat(64));
    assert.equal(byId["old-tombstone"].deletion_request_id, "old-tombstone-request");
    assert.equal(byId["old-tombstone"].completed_at, "2026-01-01T00:00:00.000Z");

    assert.equal(
      byId["recent-tombstone"].status_token_digest,
      recentTokenDigest,
      "the status token inside the dispute window must not be touched",
    );
  });
});

test("RR-03: purgeExpiredDeletionReceipts is idempotent", async () => {
  await withDatabase("deletion-receipt-purge-idempotent", async (database) => {
    const installationId = "deletion-receipt-purge-idempotent";
    await database
      .prepare(
        `INSERT INTO installations (id, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(installationId, "Idempotent test", "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z")
      .run();
    await insertTombstone(database, installationId, {
      id: "old-tombstone",
      completedAt: "2026-01-01T00:00:00.000Z",
      statusTokenDigest: "c".repeat(64),
    });

    const now = "2026-08-02T00:00:00.000Z";
    const first = await purgeExpiredDeletionReceipts(database, now);
    const second = await purgeExpiredDeletionReceipts(database, now);
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.meta.changes, 0, "a second run must have nothing left to purge");
  });
});

test("RR-03: a purged receipt can no longer resolve deletion status by status token", async () => {
  await withDatabase("deletion-receipt-purge-status-lookup", async (database) => {
    const { D1Project42Repository } = await import("../dist/worker.js");
    const installationId = "deletion-receipt-purge-status-lookup";
    const repository = new D1Project42Repository(database, installationId);
    await repository.ensureInstallation("2020-01-01T00:00:00.000Z");

    const statusToken = "expired-receipt-status-token";
    const statusTokenDigest = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(statusToken)),
    ).toString("hex");
    await insertTombstone(database, installationId, {
      id: "lookup-tombstone",
      completedAt: "2026-01-01T00:00:00.000Z",
      statusTokenDigest,
    });

    const now = "2026-08-02T00:00:00.000Z";
    await purgeExpiredDeletionReceipts(database, now);

    await assert.rejects(
      () =>
        repository.getDeletionStatus({
          requestId: "lookup-tombstone-request",
          statusToken,
        }),
      (error) => error.code === "deletion_receipt_not_found",
      "a status token whose digest was cleared by the retention purge must no longer resolve",
    );
  });
});

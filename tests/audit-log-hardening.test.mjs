import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  assertAuditMetadataIsSafe,
  AUDIT_DETAIL_RETAIN_DAYS,
  purgeExpiredAuditDetail,
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

test("RR-05: the audit detail retention window matches the declared privileged-audit policy", () => {
  assert.equal(
    AUDIT_DETAIL_RETAIN_DAYS,
    365,
    "must match the privileged-audit retention class in learner-data-policy.ts",
  );
});

test("RR-05: the audit-metadata guard accepts ordinary state/identifier fields", () => {
  const metadata = {
    state: "approved",
    expiresAt: "2026-08-02T00:00:00.000Z",
    priorSessionId: "session-123",
    attemptCount: 2,
  };
  assert.deepEqual(assertAuditMetadataIsSafe(metadata), metadata);
});

test("RR-05: the audit-metadata guard rejects sensitive key names", () => {
  for (const key of [
    "email",
    "contactEmail",
    "password",
    "apiToken",
    "clientSecret",
    "ssn",
    "phoneNumber",
    "homeAddress",
    "sessionCookie",
    "Authorization",
  ]) {
    assert.throws(
      () => assertAuditMetadataIsSafe({ [key]: "value" }),
      /rejected/,
      `expected "${key}" to be rejected`,
    );
  }
});

test("RR-05: the audit-metadata guard rejects email-shaped values regardless of key name", () => {
  assert.throws(
    () => assertAuditMetadataIsSafe({ notes: "owner@example.test" }),
    /email address/,
  );
});

test("RR-05: purgeExpiredAuditDetail clears detail past the retention window and keeps recent detail", async () => {
  await withDatabase("audit-hardening-purge", async (database) => {
    const installationId = "audit-hardening-purge";
    await database
      .prepare(
        `INSERT INTO installations (id, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(installationId, "Purge test", "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z")
      .run();

    const oldEvent = {
      id: "old-event",
      occurredAt: "2024-01-01T00:00:00.000Z", // well past 365 days before "now" below
    };
    const recentEvent = {
      id: "recent-event",
      occurredAt: "2026-07-15T00:00:00.000Z", // within the window
    };
    for (const event of [oldEvent, recentEvent]) {
      await database
        .prepare(
          `INSERT INTO audit_events (
             id, installation_id, actor_user_id, actor_issuer, actor_subject,
             action, target_type, target_id, request_id, outcome, reason,
             metadata_json, occurred_at
           ) VALUES (?, ?, NULL, NULL, NULL, 'test.action', 'test-target', ?, 'req', 'success', ?, ?, ?)`,
        )
        .bind(
          event.id,
          installationId,
          event.id,
          "reason detail that should be purged if old",
          JSON.stringify({ detail: "should be purged if old" }),
          event.occurredAt,
        )
        .run();
    }

    const now = "2026-08-02T00:00:00.000Z";
    const result = await purgeExpiredAuditDetail(database, now);
    assert.equal(result.success, true);

    const rows = await database
      .prepare(
        `SELECT id, action, outcome, reason, metadata_json, occurred_at
           FROM audit_events
          WHERE installation_id = ?
          ORDER BY id`,
      )
      .bind(installationId)
      .all();
    const byId = Object.fromEntries(rows.results.map((row) => [row.id, row]));

    assert.equal(
      byId["old-event"].metadata_json,
      "{}",
      "detail past the 365-day window must be cleared",
    );
    assert.equal(byId["old-event"].reason, null);
    // The append-only core survives even after detail is purged.
    assert.equal(byId["old-event"].action, "test.action");
    assert.equal(byId["old-event"].outcome, "success");
    assert.equal(byId["old-event"].occurred_at, oldEvent.occurredAt);

    assert.equal(
      JSON.parse(byId["recent-event"].metadata_json).detail,
      "should be purged if old",
      "detail inside the retention window must not be touched",
    );
    assert.equal(
      byId["recent-event"].reason,
      "reason detail that should be purged if old",
    );
  });
});

test("RR-05: purgeExpiredAuditDetail is idempotent", async () => {
  await withDatabase("audit-hardening-idempotent", async (database) => {
    const installationId = "audit-hardening-idempotent";
    await database
      .prepare(
        `INSERT INTO installations (id, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(installationId, "Idempotent test", "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z")
      .run();
    await database
      .prepare(
        `INSERT INTO audit_events (
           id, installation_id, actor_user_id, actor_issuer, actor_subject,
           action, target_type, target_id, request_id, outcome, reason,
           metadata_json, occurred_at
         ) VALUES (?, ?, NULL, NULL, NULL, 'test.action', 'test-target', ?, 'req', 'success', ?, ?, ?)`,
      )
      .bind(
        "old-event",
        installationId,
        "old-event",
        "old reason",
        JSON.stringify({ detail: "old" }),
        "2024-01-01T00:00:00.000Z",
      )
      .run();

    const now = "2026-08-02T00:00:00.000Z";
    const first = await purgeExpiredAuditDetail(database, now);
    const second = await purgeExpiredAuditDetail(database, now);
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.meta.changes, 0, "a second run must have nothing left to purge");
  });
});

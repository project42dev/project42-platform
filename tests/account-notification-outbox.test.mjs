import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  AccountNotificationDeliveryError,
  DeterministicAccountNotificationAdapter,
  DisabledAccountNotificationAdapter,
} from "../dist/index.js";
import { D1Project42Repository } from "../dist/worker.js";

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

function verifiedIdentity(subject, email) {
  return {
    provider: "oidc",
    issuer: "https://identity.example.test",
    subject,
    email,
    emailVerified: true,
    displayName: subject,
    authenticatedAt: 1785326400,
  };
}

test("registration and lifecycle hooks enqueue atomically and dispatch exactly once", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: "project42-account-notification-outbox" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const repository = new D1Project42Repository(database, "notification-e2e");
  const now = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(now);
  const ownerIdentity = verifiedIdentity("owner", "owner@example.test");
  const learnerIdentity = verifiedIdentity("learner", "learner@example.test");
  const owner = await repository.createOrRefreshAccount(
    ownerIdentity,
    true,
    "owner-bootstrap",
    now,
  );
  const learner = await repository.createOrRefreshAccount(
    learnerIdentity,
    false,
    "learner-signup",
    now,
  );
  await repository.createRegistrationRequest({
    account: learner,
    identity: learnerIdentity,
    receiptTokenDigest: "a".repeat(64),
    requestId: "registration-request",
    now,
  });

  const registrationRows = await database
    .prepare(
      `SELECT kind, state, attempt_count, lease_token, delivered_at
         FROM account_notifications
        WHERE installation_id = ?
        ORDER BY kind`,
    )
    .bind("notification-e2e")
    .all();
  assert.deepEqual(
    registrationRows.results.map((row) => row.kind),
    ["registration-receipt"],
  );
  assert.ok(registrationRows.results.every((row) => row.state === "pending"));

  await assert.rejects(
    repository.dispatchAccountNotifications({
      adapter: new DisabledAccountNotificationAdapter(),
      requestId: "disabled-dispatch",
      now,
    }),
    (error) => error.code === "account_notification_delivery_unavailable",
  );
  const unchanged = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM account_notifications WHERE state = 'pending'",
    )
    .first();
  assert.equal(unchanged.count, 1);

  const first = new DeterministicAccountNotificationAdapter(now);
  const second = new DeterministicAccountNotificationAdapter(now);
  const summaries = await Promise.all([
    repository.dispatchAccountNotifications({
      adapter: first,
      requestId: "concurrent-dispatch-1",
      now,
    }),
    repository.dispatchAccountNotifications({
      adapter: second,
      requestId: "concurrent-dispatch-2",
      now,
    }),
  ]);
  assert.equal(
    summaries.reduce((total, summary) => total + summary.delivered, 0),
    2,
  );
  assert.equal(first.deliveries.length + second.deliveries.length, 2);
  assert.deepEqual(
    new Set([...first.deliveries, ...second.deliveries].map((item) => item.recipient)),
    new Set(["owner@example.test", "learner@example.test"]),
  );
  for (const delivery of [...first.deliveries, ...second.deliveries]) {
    assert.doesNotMatch(`${delivery.subject}${delivery.text}${delivery.html}`, /@/);
  }

  await repository.changeAccountState({
    actor: owner,
    targetId: learner.id,
    to: "approved",
    reason: "Approved after owner review.",
    requestId: "approve-learner",
    now: "2026-07-29T12:01:00.000Z",
  });
  const approvalRows = await database
    .prepare(
      `SELECT id, kind, state, idempotency_key
         FROM account_notifications
        WHERE subject_user_id = ? AND kind = 'learner-approved'`,
    )
    .bind(learner.id)
    .all();
  assert.equal(approvalRows.results.length, 1);
  assert.equal(approvalRows.results[0].state, "pending");
  assert.equal(approvalRows.results[0].idempotency_key.length, 64);

  const temporaryFailure = new DeterministicAccountNotificationAdapter(
    now,
    new AccountNotificationDeliveryError(
      "delivery-temporary-failure",
      "temporary",
      true,
    ),
  );
  const failed = await repository.dispatchAccountNotifications({
    adapter: temporaryFailure,
    requestId: "temporary-failure",
    now: "2026-07-29T12:01:00.000Z",
  });
  assert.equal(failed.retryable, 1);
  const retryRow = await database
    .prepare(
      `SELECT state, attempt_count, available_at, lease_token, last_error_code
         FROM account_notifications WHERE id = ?`,
    )
    .bind(approvalRows.results[0].id)
    .first();
  assert.deepEqual(retryRow, {
    state: "retryable",
    attempt_count: 1,
    available_at: "2026-07-29T12:02:00.000Z",
    lease_token: null,
    last_error_code: "delivery-temporary-failure",
  });
  const recoveredAdapter = new DeterministicAccountNotificationAdapter(
    "2026-07-29T12:02:00.000Z",
  );
  const recovered = await repository.dispatchAccountNotifications({
    adapter: recoveredAdapter,
    requestId: "retry-success",
    now: "2026-07-29T12:02:00.000Z",
  });
  assert.equal(recovered.delivered, 1);

  const notificationAudits = await database
    .prepare(
      `SELECT actor_user_id, actor_issuer, actor_subject, target_id,
              metadata_json
         FROM audit_events
        WHERE action LIKE 'account-notification.%'
        ORDER BY sequence`,
    )
    .all();
  assert.ok(notificationAudits.results.length >= 4);
  for (const audit of notificationAudits.results) {
    assert.equal(audit.actor_user_id, null);
    assert.equal(audit.actor_issuer, null);
    assert.equal(audit.actor_subject, null);
    assert.doesNotMatch(
      audit.metadata_json,
      /@|example\.test|owner@example|learner@example/i,
    );
    assert.ok(audit.target_id);
  }

  await repository.changeAccountState({
    actor: owner,
    targetId: learner.id,
    to: "suspended",
    reason: "Suspend after owner review.",
    requestId: "suspend-learner",
    now: "2026-07-29T12:03:00.000Z",
  });
  await repository.changeAccountState({
    actor: owner,
    targetId: learner.id,
    to: "approved",
    reason: "Restore after owner review.",
    requestId: "restore-learner",
    now: "2026-07-29T12:04:00.000Z",
  });
  await repository.changeAccountState({
    actor: owner,
    targetId: learner.id,
    to: "revoked",
    reason: "Revoke after owner review.",
    requestId: "revoke-learner",
    now: "2026-07-29T12:05:00.000Z",
  });
  const rejectedIdentity = verifiedIdentity(
    "rejected-learner",
    "rejected@example.test",
  );
  const rejectedLearner = await repository.createOrRefreshAccount(
    rejectedIdentity,
    false,
    "rejected-learner-signup",
    "2026-07-29T12:05:00.000Z",
  );
  await repository.changeAccountState({
    actor: owner,
    targetId: rejectedLearner.id,
    to: "rejected",
    reason: "Reject after owner review.",
    requestId: "reject-learner",
    now: "2026-07-29T12:06:00.000Z",
  });
  const lifecycleKinds = await database
    .prepare(
      `SELECT DISTINCT kind
         FROM account_notifications
        WHERE kind LIKE 'learner-%'
        ORDER BY kind`,
    )
    .all();
  assert.deepEqual(
    lifecycleKinds.results.map((entry) => entry.kind),
    [
      "learner-approved",
      "learner-rejected",
      "learner-revoked",
      "learner-suspended",
    ],
  );

  await database
    .prepare("DELETE FROM users WHERE installation_id = ? AND id = ?")
    .bind("notification-e2e", learner.id)
    .run();
  const deletedSubjectRows = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM account_notifications WHERE subject_user_id = ?",
    )
    .bind(learner.id)
    .first();
  assert.equal(deletedSubjectRows.count, 0);
  const deletedFanouts = await database
    .prepare(
      `SELECT COUNT(*) AS count
         FROM account_notification_fanouts
        WHERE subject_user_id = ?`,
    )
    .bind(learner.id)
    .first();
  assert.equal(deletedFanouts.count, 0);
});

test("owner alerts expand through durable bounded pages without truncation", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: "project42-account-notification-fanout" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  const installationId = "notification-fanout";
  const repository = new D1Project42Repository(database, installationId);
  const now = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(now);

  const ownerStatements = [];
  for (let index = 0; index < 51; index += 1) {
    const id = `owner-${String(index).padStart(3, "0")}`;
    ownerStatements.push(
      database
        .prepare(
          `INSERT INTO users (
             id, installation_id, display_name, primary_email, email_verified,
             account_state, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 1, 'approved', ?, ?)`,
        )
        .bind(id, installationId, id, `${id}@example.test`, now, now),
      database
        .prepare(
          `INSERT INTO role_assignments (
             installation_id, user_id, role, assigned_by_user_id, assigned_at
           ) VALUES (?, ?, 'owner', NULL, ?)`,
        )
        .bind(installationId, id, now),
      database
        .prepare(
          `INSERT INTO approval_decisions (
             id, installation_id, user_id, from_state, to_state,
             decision_kind, reason, actor_user_id, domain_rule_id, decided_at
           ) VALUES (?, ?, ?, NULL, 'approved', 'registration',
                     'Test owner bootstrap.', NULL, NULL, ?)`,
        )
        .bind(`decision-${id}`, installationId, id, now),
    );
  }
  for (let index = 0; index < ownerStatements.length; index += 60) {
    await database.batch(ownerStatements.slice(index, index + 60));
  }

  const learnerIdentity = verifiedIdentity(
    "fanout-learner",
    "fanout-learner@example.test",
  );
  const learner = await repository.createOrRefreshAccount(
    learnerIdentity,
    false,
    "fanout-registration",
    now,
  );
  await repository.createRegistrationRequest({
    account: learner,
    identity: learnerIdentity,
    receiptTokenDigest: "d".repeat(64),
    requestId: "fanout-registration",
    now,
  });
  const initialNotifications = await database
    .prepare("SELECT COUNT(*) AS count FROM account_notifications")
    .first();
  assert.equal(initialNotifications.count, 1);
  const initialFanout = await database
    .prepare(
      `SELECT state, cursor_owner_user_id, revision
         FROM account_notification_fanouts`,
    )
    .first();
  assert.deepEqual(initialFanout, {
    state: "pending",
    cursor_owner_user_id: null,
    revision: 1,
  });

  const delivered = [];
  for (const dispatchAt of [
    "2026-07-29T12:00:00.000Z",
    "2026-07-29T12:01:00.000Z",
    "2026-07-29T12:02:00.000Z",
  ]) {
    const adapter = new DeterministicAccountNotificationAdapter(dispatchAt);
    await repository.dispatchAccountNotifications({
      adapter,
      requestId: `fanout-${dispatchAt}`,
      now: dispatchAt,
      limit: 100,
    });
    delivered.push(...adapter.deliveries);
  }
  assert.equal(delivered.length, 52);
  assert.equal(new Set(delivered.map((item) => item.notificationId)).size, 52);
  assert.equal(
    delivered.filter((item) => item.kind === "owner-registration-alert").length,
    51,
  );
  const completedFanout = await database
    .prepare(
      `SELECT state, cursor_owner_user_id, revision
         FROM account_notification_fanouts`,
    )
    .first();
  assert.deepEqual(completedFanout, {
    state: "complete",
    cursor_owner_user_id: "owner-050",
    revision: 4,
  });
  const outbox = await database
    .prepare(
      `SELECT state, COUNT(*) AS count
         FROM account_notifications
        GROUP BY state`,
    )
    .all();
  assert.deepEqual(outbox.results, [{ state: "delivered", count: 52 }]);
});

test("notification idempotency conflicts roll back the authoritative D1 batch", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: "project42-account-notification-atomicity" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  const installationId = "notification-atomicity";
  const repository = new D1Project42Repository(database, installationId);
  const now = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(now);
  const identity = verifiedIdentity("atomic-learner", "atomic@example.test");
  const learner = await repository.createOrRefreshAccount(
    identity,
    false,
    "atomic-registration",
    now,
  );
  const idempotencyKey = "e".repeat(64);
  await database
    .prepare(
      `INSERT INTO account_notifications (
         id, installation_id, recipient_user_id, subject_user_id, kind,
         state, template_version, idempotency_key, attempt_count,
         max_attempts, available_at, created_at, updated_at
       ) VALUES (
         'existing-notification', ?, ?, ?, 'registration-receipt',
         'pending', '1.0', ?, 0, 5, ?, ?, ?
       )`,
    )
    .bind(
      installationId,
      learner.id,
      learner.id,
      idempotencyKey,
      now,
      now,
      now,
    )
    .run();
  await assert.rejects(
    database.batch([
      database
        .prepare(
          `UPDATE users SET display_name = 'must-roll-back'
            WHERE installation_id = ? AND id = ?`,
        )
        .bind(installationId, learner.id),
      database
        .prepare(
          `INSERT INTO account_notifications (
             id, installation_id, recipient_user_id, subject_user_id, kind,
             state, template_version, idempotency_key, attempt_count,
             max_attempts, available_at, created_at, updated_at
           ) VALUES (
             'conflicting-notification', ?, ?, ?, 'registration-receipt',
             'pending', '1.0', ?, 0, 5, ?, ?, ?
           )`,
        )
        .bind(
          installationId,
          learner.id,
          learner.id,
          idempotencyKey,
          now,
          now,
          now,
        ),
    ]),
    /UNIQUE constraint failed/,
  );
  const unchanged = await database
    .prepare(
      "SELECT display_name FROM users WHERE installation_id = ? AND id = ?",
    )
    .bind(installationId, learner.id)
    .first();
  assert.equal(unchanged.display_name, "atomic-learner");
});

test("expired leases recover and bounded retries reach dead letter", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: "project42-account-notification-recovery" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  const repository = new D1Project42Repository(database, "notification-recovery");
  const now = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(now);
  const learnerIdentity = verifiedIdentity("learner", "learner@example.test");
  const learner = await repository.createOrRefreshAccount(
    learnerIdentity,
    false,
    "learner-signup",
    now,
  );
  await repository.createRegistrationRequest({
    account: learner,
    identity: learnerIdentity,
    receiptTokenDigest: "b".repeat(64),
    requestId: "registration-request",
    now,
  });
  const row = await database
    .prepare(
      "SELECT id FROM account_notifications WHERE kind = 'registration-receipt'",
    )
    .first();
  const alwaysFails = new DeterministicAccountNotificationAdapter(
    now,
    new AccountNotificationDeliveryError(
      "delivery-temporary-failure",
      "temporary",
      true,
    ),
  );
  for (const attemptAt of [
    "2026-07-29T12:00:00.000Z",
    "2026-07-29T12:01:00.000Z",
    "2026-07-29T12:03:00.000Z",
    "2026-07-29T12:07:00.000Z",
    "2026-07-29T12:15:00.000Z",
  ]) {
    await repository.dispatchAccountNotifications({
      adapter: alwaysFails,
      requestId: `bounded-failure-${attemptAt}`,
      now: attemptAt,
    });
  }
  const exhausted = await database
    .prepare(
      `SELECT state, attempt_count, last_error_code
         FROM account_notifications WHERE id = ?`,
    )
    .bind(row.id)
    .first();
  assert.deepEqual(exhausted, {
    state: "dead-letter",
    attempt_count: 5,
    last_error_code: "delivery-temporary-failure",
  });

  const recoveryIdentity = verifiedIdentity(
    "recovery-learner",
    "recovery@example.test",
  );
  const recoveryLearner = await repository.createOrRefreshAccount(
    recoveryIdentity,
    false,
    "recovery-learner-signup",
    "2026-07-29T12:16:00.000Z",
  );
  await repository.createRegistrationRequest({
    account: recoveryLearner,
    identity: recoveryIdentity,
    receiptTokenDigest: "c".repeat(64),
    requestId: "recovery-registration-request",
    now: "2026-07-29T12:16:00.000Z",
  });
  const recoveryRow = await database
    .prepare(
      `SELECT id FROM account_notifications
        WHERE kind = 'registration-receipt' AND subject_user_id = ?`,
    )
    .bind(recoveryLearner.id)
    .first();
  await database
    .prepare(
      `UPDATE account_notifications
          SET state = 'delivering', attempt_count = 5,
              lease_token = 'expired', lease_expires_at = ?,
              updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      "2026-07-29T12:15:00.000Z",
      "2026-07-29T12:16:00.000Z",
      recoveryRow.id,
    )
    .run();
  const summary = await repository.dispatchAccountNotifications({
    adapter: new DeterministicAccountNotificationAdapter(
      "2026-07-29T12:16:00.000Z",
    ),
    requestId: "lease-recovery",
    now: "2026-07-29T12:16:00.000Z",
  });
  assert.equal(summary.recovered, 1);
  assert.equal(summary.deadLetter, 1);
  const terminal = await database
    .prepare(
      "SELECT state, last_error_code, lease_token FROM account_notifications WHERE id = ?",
    )
    .bind(recoveryRow.id)
    .first();
  assert.deepEqual(terminal, {
    state: "dead-letter",
    last_error_code: "delivery-lease-expired",
    lease_token: null,
  });
});

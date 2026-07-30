import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { Pool } from "pg";
import {
  AccountNotificationDeliveryError,
  DeterministicAccountNotificationAdapter,
  DisabledAccountNotificationAdapter,
} from "../dist/index.js";
import { D1Project42Repository } from "../dist/worker.js";
import { applyPostgresMigrations } from "../dist/self-host/migrate.js";
import { PostgresD1CompatibilityDatabase } from "../dist/self-host/postgres-d1.js";

const systemActor = { kind: "system" };

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

async function exerciseDeliveryTimeRecipientEligibility(database, prefix) {
  const primaryInstallationId = `${prefix}-primary`;
  const otherInstallationId = `${prefix}-other`;
  const primaryRepository = new D1Project42Repository(
    database,
    primaryInstallationId,
  );
  const otherRepository = new D1Project42Repository(
    database,
    otherInstallationId,
  );
  const now = "2026-07-29T12:00:00.000Z";
  await primaryRepository.ensureInstallation(now);
  await otherRepository.ensureInstallation(now);

  const removedOwner = await primaryRepository.createOrRefreshAccount(
    verifiedIdentity(
      `${prefix}-removed-owner`,
      `${prefix}-removed-owner@example.test`,
    ),
    true,
    `${prefix}-removed-owner-bootstrap`,
    now,
  );
  const revokedOwner = await primaryRepository.createOrRefreshAccount(
    verifiedIdentity(
      `${prefix}-revoked-owner`,
      `${prefix}-revoked-owner@example.test`,
    ),
    true,
    `${prefix}-revoked-owner-bootstrap`,
    now,
  );
  const subject = await primaryRepository.createOrRefreshAccount(
    verifiedIdentity(`${prefix}-subject`, `${prefix}-subject@example.test`),
    false,
    `${prefix}-subject-registration`,
    now,
  );
  const lifecycleRecipient =
    await primaryRepository.createOrRefreshAccount(
      verifiedIdentity(
        `${prefix}-lifecycle`,
        `${prefix}-lifecycle@example.test`,
      ),
      false,
      `${prefix}-lifecycle-registration`,
      now,
    );

  const subjectRequestId = `${prefix}-subject-request`;
  const approvedTransitionId = `${prefix}-approved-transition`;
  const suspendedTransitionId = `${prefix}-suspended-transition`;
  await database.batch([
    database
      .prepare(
        `UPDATE users
            SET active_registration_request_id = ?, updated_at = ?
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(subjectRequestId, now, primaryInstallationId, subject.id),
    database
      .prepare(
        `INSERT INTO registration_requests (
           id, installation_id, user_id, receipt_token_digest, requested_at,
           last_seen_at, expires_at, revoked_at, replaced_by_request_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .bind(
        subjectRequestId,
        primaryInstallationId,
        subject.id,
        "5".repeat(64),
        now,
        now,
        "2026-08-29T12:00:00.000Z",
      ),
    database
      .prepare(
        `DELETE FROM role_assignments
          WHERE installation_id = ? AND user_id = ? AND role = 'owner'`,
      )
      .bind(primaryInstallationId, removedOwner.id),
    database
      .prepare(
        `INSERT INTO role_assignments (
           installation_id, user_id, role, assigned_by_user_id, assigned_at
         ) VALUES (?, ?, 'owner', NULL, ?)`,
      )
      .bind(otherInstallationId, removedOwner.id, now),
    database
      .prepare(
        `UPDATE users SET account_state = 'revoked', updated_at = ?
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(now, primaryInstallationId, revokedOwner.id),
    database
      .prepare(
        `UPDATE users
            SET account_state = 'approved', state_revision = state_revision + 1,
                state_transition_id = ?, updated_at = ?
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(
        approvedTransitionId,
        now,
        primaryInstallationId,
        lifecycleRecipient.id,
      ),
    database
      .prepare(
        `INSERT INTO approval_decisions (
           id, installation_id, user_id, from_state, to_state, decision_kind,
           reason, actor_user_id, domain_rule_id, decided_at, transition_id
         ) VALUES (?, ?, ?, 'pending', 'approved', 'owner-decision',
                   'Eligibility fixture.', NULL, NULL, ?, ?)`,
      )
      .bind(
        `${prefix}-approved-decision`,
        primaryInstallationId,
        lifecycleRecipient.id,
        now,
        approvedTransitionId,
      ),
  ]);
  await database.batch([
    database
      .prepare(
        `UPDATE users
            SET account_state = 'suspended',
                state_revision = state_revision + 1,
                state_transition_id = ?, updated_at = ?
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(
        suspendedTransitionId,
        now,
        primaryInstallationId,
        lifecycleRecipient.id,
      ),
    database
      .prepare(
        `INSERT INTO approval_decisions (
           id, installation_id, user_id, from_state, to_state, decision_kind,
           reason, actor_user_id, domain_rule_id, decided_at, transition_id
         ) VALUES (?, ?, ?, 'approved', 'suspended', 'owner-decision',
                   'Eligibility fixture.', NULL, NULL, ?, ?)`,
      )
      .bind(
        `${prefix}-suspended-decision`,
        primaryInstallationId,
        lifecycleRecipient.id,
        now,
        suspendedTransitionId,
      ),
  ]);

  const notificationRows = [
    {
      id: `${prefix}-removed-owner-alert`,
      recipientUserId: removedOwner.id,
      subjectUserId: subject.id,
      kind: "owner-registration-alert",
      idempotencyKey: "6".repeat(64),
    },
    {
      id: `${prefix}-revoked-owner-alert`,
      recipientUserId: revokedOwner.id,
      subjectUserId: subject.id,
      kind: "owner-registration-alert",
      idempotencyKey: "7".repeat(64),
    },
    {
      id: `${prefix}-stale-approval`,
      recipientUserId: lifecycleRecipient.id,
      subjectUserId: lifecycleRecipient.id,
      kind: "learner-approved",
      idempotencyKey: "8".repeat(64),
    },
    {
      id: `${prefix}-current-suspension`,
      recipientUserId: lifecycleRecipient.id,
      subjectUserId: lifecycleRecipient.id,
      kind: "learner-suspended",
      idempotencyKey: "9".repeat(64),
    },
  ];
  await database.batch(
    notificationRows.map((notification) =>
      database
        .prepare(
          `INSERT INTO account_notifications (
             id, installation_id, recipient_user_id, subject_user_id, kind,
             state, template_version, idempotency_key, attempt_count,
             max_attempts, available_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'pending', '1.0', ?, 0, 5, ?, ?, ?)`,
        )
        .bind(
          notification.id,
          primaryInstallationId,
          notification.recipientUserId,
          notification.subjectUserId,
          notification.kind,
          notification.idempotencyKey,
          now,
          now,
          now,
        ),
    ),
  );

  const otherAdapter = new DeterministicAccountNotificationAdapter(now);
  const otherSummary = await otherRepository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: otherAdapter,
    requestId: `${prefix}-other-installation-dispatch`,
    now,
  });
  assert.equal(otherSummary.claimed, 0);
  assert.equal(otherAdapter.deliveries.length, 0);

  const adapter = new DeterministicAccountNotificationAdapter(now);
  const summary = await primaryRepository.dispatchAccountNotifications({
    actor: systemActor,
    adapter,
    requestId: `${prefix}-primary-dispatch`,
    now,
  });
  assert.equal(summary.claimed, 4);
  assert.equal(summary.delivered, 1);
  assert.equal(summary.deadLetter, 3);
  assert.deepEqual(
    adapter.deliveries.map((delivery) => delivery.kind),
    ["learner-suspended"],
  );

  const states = await database
    .prepare(
      `SELECT id, state, last_error_code
         FROM account_notifications
        WHERE installation_id = ?
        ORDER BY id`,
    )
    .bind(primaryInstallationId)
    .all();
  assert.deepEqual(
    Object.fromEntries(
      states.results.map((row) => [
        row.id,
        { state: row.state, errorCode: row.last_error_code },
      ]),
    ),
    {
      [`${prefix}-current-suspension`]: {
        state: "delivered",
        errorCode: null,
      },
      [`${prefix}-removed-owner-alert`]: {
        state: "dead-letter",
        errorCode: "recipient-ineligible",
      },
      [`${prefix}-revoked-owner-alert`]: {
        state: "dead-letter",
        errorCode: "recipient-ineligible",
      },
      [`${prefix}-stale-approval`]: {
        state: "dead-letter",
        errorCode: "recipient-ineligible",
      },
    },
  );
  const ineligibleAudits = await database
    .prepare(
      `SELECT metadata_json
         FROM audit_events
        WHERE installation_id = ?
          AND action = 'account-notification.dead-lettered'
        ORDER BY sequence`,
    )
    .bind(primaryInstallationId)
    .all();
  assert.equal(ineligibleAudits.results.length, 3);
  for (const audit of ineligibleAudits.results) {
    assert.equal(
      JSON.parse(audit.metadata_json).errorCode,
      "recipient-ineligible",
    );
    assert.doesNotMatch(audit.metadata_json, /@|example\.test/i);
  }
}

async function exerciseNotificationEventCorrelation(database, prefix) {
  const installationId = `${prefix}-correlation`;
  const otherInstallationId = `${prefix}-correlation-other`;
  const repository = new D1Project42Repository(database, installationId);
  const otherRepository = new D1Project42Repository(
    database,
    otherInstallationId,
  );
  const setupAt = "2026-05-01T00:00:00.000Z";
  const dispatchAt = "2026-07-30T12:00:00.000Z";
  await repository.ensureInstallation(setupAt);
  await otherRepository.ensureInstallation(setupAt);
  const owner = await repository.createOrRefreshAccount(
    verifiedIdentity(`${prefix}-owner`, `${prefix}-owner@example.test`),
    true,
    `${prefix}-owner-bootstrap`,
    setupAt,
  );

  async function createLearner(name) {
    const identity = verifiedIdentity(
      `${prefix}-${name}`,
      `${prefix}-${name}@example.test`,
    );
    return {
      identity,
      account: await repository.createOrRefreshAccount(
        identity,
        false,
        `${prefix}-${name}-create`,
        setupAt,
      ),
    };
  }

  async function requestAccount(learner, digestCharacter, requestedAt) {
    await repository.createRegistrationRequest({
      account: learner.account,
      identity: learner.identity,
      receiptTokenDigest: digestCharacter.repeat(64),
      requestId: `${prefix}-${digestCharacter}-registration`,
      now: requestedAt,
    });
  }

  async function transitionAccount(learner, to, at, label) {
    learner.account = await repository.changeAccountState({
      actor: owner,
      targetId: learner.account.id,
      to,
      reason: `Notification correlation fixture: ${label}.`,
      requestId: `${prefix}-${label}`,
      now: at,
    });
  }

  const pendingReceipt = await createLearner("pending-receipt");
  const rejectedReceipt = await createLearner("rejected-receipt");
  const expiredReceipt = await createLearner("expired-receipt");
  const revokedReceipt = await createLearner("revoked-receipt");
  const replacedReceipt = await createLearner("replaced-receipt");
  const resolvedSubject = await createLearner("resolved-subject");
  const approvedLifecycle = await createLearner("approved-lifecycle");
  const suspendedLifecycle = await createLearner("suspended-lifecycle");
  const revokedLifecycle = await createLearner("revoked-lifecycle");
  const stateCycle = await createLearner("state-cycle");
  const rejectedCycle = await createLearner("rejected-cycle");
  const mismatchSubject = await createLearner("mismatch-subject");

  const pendingRequestedAt = "2026-07-29T08:00:00.000Z";
  await requestAccount(pendingReceipt, "a", pendingRequestedAt);

  const rejectedAt = "2026-07-29T08:05:00.000Z";
  const rejectedRequestedAt = "2026-07-29T08:06:00.000Z";
  await transitionAccount(
    rejectedReceipt,
    "rejected",
    rejectedAt,
    "reject-receipt-account",
  );
  await requestAccount(rejectedReceipt, "b", rejectedRequestedAt);

  const expiredRequestedAt = "2026-06-01T08:00:00.000Z";
  await requestAccount(expiredReceipt, "c", expiredRequestedAt);

  const revokedRequestedAt = "2026-07-29T08:10:00.000Z";
  await requestAccount(revokedReceipt, "d", revokedRequestedAt);
  const revokedRequest = await database
    .prepare(
      `SELECT id FROM registration_requests
        WHERE installation_id = ? AND user_id = ? AND requested_at = ?`,
    )
    .bind(installationId, revokedReceipt.account.id, revokedRequestedAt)
    .first();
  assert.ok(revokedRequest?.id);
  await database.batch([
    database
      .prepare(
        `UPDATE registration_requests
            SET revoked_at = ?
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(
        "2026-07-29T08:11:00.000Z",
        installationId,
        revokedRequest.id,
      ),
    database
      .prepare(
        `UPDATE users
            SET active_registration_request_id = NULL, updated_at = ?
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(
        "2026-07-29T08:11:00.000Z",
        installationId,
        revokedReceipt.account.id,
      ),
  ]);

  const replacedRequestedAt = "2026-07-29T08:20:00.000Z";
  const replacementRequestedAt = "2026-07-29T08:21:00.000Z";
  await requestAccount(replacedReceipt, "e", replacedRequestedAt);
  await requestAccount(replacedReceipt, "f", replacementRequestedAt);

  const resolvedRequestedAt = "2026-07-29T08:30:00.000Z";
  await requestAccount(resolvedSubject, "g", resolvedRequestedAt);
  await transitionAccount(
    resolvedSubject,
    "approved",
    "2026-07-29T08:31:00.000Z",
    "resolve-registration-before-owner-alert",
  );

  const approvedAt = "2026-07-29T09:00:00.000Z";
  await transitionAccount(
    approvedLifecycle,
    "approved",
    approvedAt,
    "approve-current-lifecycle",
  );

  const suspendedApprovedAt = "2026-07-29T09:10:00.000Z";
  const suspendedAt = "2026-07-29T09:11:00.000Z";
  await transitionAccount(
    suspendedLifecycle,
    "approved",
    suspendedApprovedAt,
    "approve-before-suspension",
  );
  await transitionAccount(
    suspendedLifecycle,
    "suspended",
    suspendedAt,
    "suspend-current-lifecycle",
  );

  const revokedAt = "2026-07-29T09:20:00.000Z";
  await transitionAccount(
    revokedLifecycle,
    "revoked",
    revokedAt,
    "revoke-current-lifecycle",
  );

  const firstCycleApprovalAt = "2026-07-29T09:30:00.000Z";
  const cycleSuspensionAt = "2026-07-29T09:31:00.000Z";
  const currentCycleApprovalAt = "2026-07-29T09:32:00.000Z";
  await transitionAccount(
    stateCycle,
    "approved",
    firstCycleApprovalAt,
    "cycle-first-approval",
  );
  await transitionAccount(
    stateCycle,
    "suspended",
    cycleSuspensionAt,
    "cycle-suspension",
  );
  await transitionAccount(
    stateCycle,
    "approved",
    currentCycleApprovalAt,
    "cycle-current-approval",
  );

  const rejectedCycleAt = "2026-07-29T09:40:00.000Z";
  const rejectedCycleApprovalAt = "2026-07-29T09:41:00.000Z";
  await transitionAccount(
    rejectedCycle,
    "rejected",
    rejectedCycleAt,
    "cycle-rejection",
  );
  await transitionAccount(
    rejectedCycle,
    "approved",
    rejectedCycleApprovalAt,
    "cycle-approval-after-rejection",
  );

  const staleRevokedId = `${prefix}-stale-revoked`;
  const mismatchedId = `${prefix}-mismatched-subject`;
  await database.batch([
    database
      .prepare(
        `INSERT INTO account_notifications (
           id, installation_id, recipient_user_id, subject_user_id, kind,
           state, template_version, idempotency_key, attempt_count,
           max_attempts, available_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'learner-revoked', 'pending', '1.0', ?,
                   0, 5, ?, ?, ?)`,
      )
      .bind(
        staleRevokedId,
        installationId,
        revokedLifecycle.account.id,
        revokedLifecycle.account.id,
        "1".repeat(64),
        dispatchAt,
        "2026-07-29T09:19:00.000Z",
        dispatchAt,
      ),
    database
      .prepare(
        `INSERT INTO account_notifications (
           id, installation_id, recipient_user_id, subject_user_id, kind,
           state, template_version, idempotency_key, attempt_count,
           max_attempts, available_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'learner-approved', 'pending', '1.0', ?,
                   0, 5, ?, ?, ?)`,
      )
      .bind(
        mismatchedId,
        installationId,
        approvedLifecycle.account.id,
        mismatchSubject.account.id,
        "2".repeat(64),
        dispatchAt,
        approvedAt,
        dispatchAt,
      ),
  ]);

  const otherAdapter = new DeterministicAccountNotificationAdapter(dispatchAt);
  const otherSummary = await otherRepository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: otherAdapter,
    requestId: `${prefix}-correlation-other-dispatch`,
    now: dispatchAt,
  });
  assert.equal(otherSummary.claimed, 0);
  assert.equal(otherAdapter.deliveries.length, 0);

  const adapter = new DeterministicAccountNotificationAdapter(dispatchAt);
  for (let page = 0; page < 20; page += 1) {
    const summary = await repository.dispatchAccountNotifications({
      actor: systemActor,
      adapter,
      requestId: `${prefix}-correlation-dispatch-${page}`,
      now: dispatchAt,
      limit: 10,
    });
    const unfinished = await database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM account_notification_fanouts
             WHERE installation_id = ? AND state = 'pending') +
           (SELECT COUNT(*) FROM account_notifications
             WHERE installation_id = ?
               AND state IN ('pending', 'retryable', 'delivering')) AS count`,
      )
      .bind(installationId, installationId)
      .first();
    if (Number(unfinished?.count ?? 0) === 0) break;
    assert.ok(
      page < 19 || summary.claimed > 0,
      "notification correlation dispatch did not converge",
    );
  }

  const unfinished = await database
    .prepare(
      `SELECT COUNT(*) AS count
         FROM account_notifications
        WHERE installation_id = ?
          AND state IN ('pending', 'retryable', 'delivering')`,
    )
    .bind(installationId)
    .first();
  assert.equal(Number(unfinished?.count ?? 0), 0);

  async function notificationState(userId, kind, createdAt) {
    return database
      .prepare(
        `SELECT state, last_error_code
           FROM account_notifications
          WHERE installation_id = ? AND subject_user_id = ?
            AND kind = ? AND created_at = ?
          ORDER BY id
          LIMIT 1`,
      )
      .bind(installationId, userId, kind, createdAt)
      .first();
  }

  assert.deepEqual(
    await notificationState(
      pendingReceipt.account.id,
      "registration-receipt",
      pendingRequestedAt,
    ),
    { state: "delivered", last_error_code: null },
  );
  assert.deepEqual(
    await notificationState(
      rejectedReceipt.account.id,
      "registration-receipt",
      rejectedRequestedAt,
    ),
    { state: "delivered", last_error_code: null },
  );
  for (const [learner, requestedAt] of [
    [expiredReceipt, expiredRequestedAt],
    [revokedReceipt, revokedRequestedAt],
    [replacedReceipt, replacedRequestedAt],
    [resolvedSubject, resolvedRequestedAt],
  ]) {
    assert.deepEqual(
      await notificationState(
        learner.account.id,
        "registration-receipt",
        requestedAt,
      ),
      { state: "dead-letter", last_error_code: "recipient-ineligible" },
    );
  }
  assert.deepEqual(
    await notificationState(
      replacedReceipt.account.id,
      "registration-receipt",
      replacementRequestedAt,
    ),
    { state: "delivered", last_error_code: null },
  );

  for (const [learner, kind, at] of [
    [approvedLifecycle, "learner-approved", approvedAt],
    [rejectedReceipt, "learner-rejected", rejectedAt],
    [suspendedLifecycle, "learner-suspended", suspendedAt],
    [revokedLifecycle, "learner-revoked", revokedAt],
    [stateCycle, "learner-approved", currentCycleApprovalAt],
    [rejectedCycle, "learner-approved", rejectedCycleApprovalAt],
  ]) {
    assert.deepEqual(await notificationState(learner.account.id, kind, at), {
      state: "delivered",
      last_error_code: null,
    });
  }
  for (const [learner, kind, at] of [
    [suspendedLifecycle, "learner-approved", suspendedApprovedAt],
    [stateCycle, "learner-approved", firstCycleApprovalAt],
    [stateCycle, "learner-suspended", cycleSuspensionAt],
    [rejectedCycle, "learner-rejected", rejectedCycleAt],
  ]) {
    assert.deepEqual(await notificationState(learner.account.id, kind, at), {
      state: "dead-letter",
      last_error_code: "recipient-ineligible",
    });
  }
  for (const id of [staleRevokedId, mismatchedId]) {
    assert.deepEqual(
      await database
        .prepare(
          `SELECT state, last_error_code
             FROM account_notifications
            WHERE installation_id = ? AND id = ?`,
        )
        .bind(installationId, id)
        .first(),
      { state: "dead-letter", last_error_code: "recipient-ineligible" },
    );
  }

  for (const [learner, expectedStates] of [
    [pendingReceipt, ["delivered"]],
    [rejectedReceipt, ["delivered"]],
    [replacedReceipt, ["delivered", "delivered"]],
    [expiredReceipt, ["dead-letter"]],
    [revokedReceipt, ["dead-letter"]],
    [resolvedSubject, ["dead-letter"]],
  ]) {
    const alerts = await database
      .prepare(
        `SELECT state, last_error_code
           FROM account_notifications
          WHERE installation_id = ? AND subject_user_id = ?
            AND kind = 'owner-registration-alert'
          ORDER BY created_at, id`,
      )
      .bind(installationId, learner.account.id)
      .all();
    assert.deepEqual(
      alerts.results.map((row) => row.state),
      expectedStates,
    );
    for (const row of alerts.results) {
      assert.equal(
        row.last_error_code,
        row.state === "dead-letter" ? "recipient-ineligible" : null,
      );
    }
  }

  const deadLetters = await database
    .prepare(
      `SELECT COUNT(*) AS count
         FROM account_notifications
        WHERE installation_id = ? AND state = 'dead-letter'
          AND last_error_code = 'recipient-ineligible'`,
    )
    .bind(installationId)
    .first();
  const ineligibleAudits = await database
    .prepare(
      `SELECT metadata_json
         FROM audit_events
        WHERE installation_id = ?
          AND action = 'account-notification.dead-lettered'
          AND metadata_json LIKE '%recipient-ineligible%'
        ORDER BY sequence`,
    )
    .bind(installationId)
    .all();
  assert.equal(
    ineligibleAudits.results.length,
    Number(deadLetters?.count ?? 0),
  );
  for (const audit of ineligibleAudits.results) {
    assert.equal(
      JSON.parse(audit.metadata_json).errorCode,
      "recipient-ineligible",
    );
    assert.doesNotMatch(
      audit.metadata_json,
      /@|example\.test|transition|registration-request/i,
    );
  }
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
      actor: systemActor,
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
      actor: systemActor,
      adapter: first,
      requestId: "concurrent-dispatch-1",
      now,
    }),
    repository.dispatchAccountNotifications({
      actor: systemActor,
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
    actor: systemActor,
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
    actor: systemActor,
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
    assert.equal(JSON.parse(audit.metadata_json).actorKind, "system");
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

test("D1 rechecks notification recipients before delivery", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: {
      PROJECT42_DB: "project42-account-notification-recipient-recheck",
    },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  await exerciseDeliveryTimeRecipientEligibility(database, "d1-eligibility");
});

test("D1 correlates notifications to the current request and transition", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: {
      PROJECT42_DB: "project42-account-notification-event-correlation",
    },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  await exerciseNotificationEventCorrelation(database, "d1-event");
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
    "2026-07-29T12:03:00.000Z",
    "2026-07-29T12:04:00.000Z",
    "2026-07-29T12:05:00.000Z",
  ]) {
    const adapter = new DeterministicAccountNotificationAdapter(dispatchAt);
    await repository.dispatchAccountNotifications({
      actor: systemActor,
      adapter,
      requestId: `fanout-${dispatchAt}`,
      now: dispatchAt,
      limit: 10,
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

test("D1 fanout retries owner churn without skipping or duplicating recipients", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: "project42-account-notification-owner-churn" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  assert.equal(typeof database.batchWithPostcondition, "undefined");
  await applyD1Migrations(database);
  const installationId = "notification-owner-churn";
  const repository = new D1Project42Repository(database, installationId);
  const now = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(now);
  const firstOwner = await repository.createOrRefreshAccount(
    verifiedIdentity("owner-churn-a", "owner-churn-a@example.test"),
    true,
    "owner-churn-a-bootstrap",
    now,
  );
  const secondOwner = await repository.createOrRefreshAccount(
    verifiedIdentity("owner-churn-b", "owner-churn-b@example.test"),
    true,
    "owner-churn-b-bootstrap",
    now,
  );
  const learnerIdentity = verifiedIdentity(
    "owner-churn-learner",
    "owner-churn-learner@example.test",
  );
  const learner = await repository.createOrRefreshAccount(
    learnerIdentity,
    false,
    "owner-churn-registration",
    now,
  );
  await repository.createRegistrationRequest({
    account: learner,
    identity: learnerIdentity,
    receiptTokenDigest: "9".repeat(64),
    requestId: "owner-churn-registration",
    now,
  });

  let churnBeforeNextBatch = true;
  const churnDatabase = {
    prepare(query) {
      return database.prepare(query);
    },
    async batch(statements) {
      if (churnBeforeNextBatch) {
        churnBeforeNextBatch = false;
        await database
          .prepare(
            `DELETE FROM role_assignments
              WHERE installation_id = ? AND user_id = ? AND role = 'owner'`,
          )
          .bind(installationId, firstOwner.id)
          .run();
      }
      return database.batch(statements);
    },
  };
  const churnRepository = new D1Project42Repository(
    churnDatabase,
    installationId,
  );
  const firstAdapter = new DeterministicAccountNotificationAdapter(now);
  const firstDispatch = await churnRepository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: firstAdapter,
    requestId: "owner-churn-first-dispatch",
    now,
  });
  assert.equal(firstDispatch.delivered, 2);
  const pendingFanout = await database
    .prepare(
      `SELECT state, cursor_owner_user_id, revision
         FROM account_notification_fanouts`,
    )
    .first();
  assert.deepEqual(pendingFanout, {
    state: "pending",
    cursor_owner_user_id: null,
    revision: 1,
  });

  const retryAdapter = new DeterministicAccountNotificationAdapter(now);
  const retryDispatch = await repository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: retryAdapter,
    requestId: "owner-churn-retry",
    now,
  });
  assert.equal(retryDispatch.delivered, 0);
  const completedFanout = await database
    .prepare(
      `SELECT state, cursor_owner_user_id, revision
         FROM account_notification_fanouts`,
    )
    .first();
  assert.deepEqual(completedFanout, {
    state: "complete",
    cursor_owner_user_id: secondOwner.id,
    revision: 2,
  });
  const ownerAlerts = await database
    .prepare(
      `SELECT recipient_user_id, state, COUNT(*) AS count
         FROM account_notifications
        WHERE kind = 'owner-registration-alert'
        GROUP BY recipient_user_id, state`,
    )
    .all();
  assert.deepEqual(ownerAlerts.results, [
    {
      recipient_user_id: secondOwner.id,
      state: "delivered",
      count: 1,
    },
  ]);
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
      actor: systemActor,
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
  await assert.rejects(
    repository.replayDeadLetterAccountNotifications({
      notificationIds: [row.id, "missing-dead-letter"],
      actor: systemActor,
      requestId: "dead-letter-replay-invalid-batch",
      now: "2026-07-29T12:15:00.500Z",
    }),
    (error) => error.code === "account_notification_not_replayable",
  );
  assert.equal(
    (
      await database
        .prepare(
          `SELECT COUNT(*) AS count
             FROM account_notifications
            WHERE replay_of_notification_id = ?`,
        )
        .bind(row.id)
        .first()
    ).count,
    0,
  );
  const replayed = await repository.replayDeadLetterAccountNotifications({
    notificationIds: [row.id],
    actor: systemActor,
    requestId: "dead-letter-replay",
    now: "2026-07-29T12:15:01.000Z",
  });
  assert.deepEqual(replayed, {
    requested: 1,
    replayed: 1,
    alreadyReplayed: 0,
  });
  const repeatedReplay =
    await repository.replayDeadLetterAccountNotifications({
      notificationIds: [row.id],
      actor: systemActor,
      requestId: "dead-letter-replay-repeated",
      now: "2026-07-29T12:15:02.000Z",
    });
  assert.deepEqual(repeatedReplay, {
    requested: 1,
    replayed: 0,
    alreadyReplayed: 1,
  });
  const replayRows = await database
    .prepare(
      `SELECT id, state, attempt_count, replay_of_notification_id
         FROM account_notifications
        WHERE id = ? OR replay_of_notification_id = ?
        ORDER BY replay_of_notification_id`,
    )
    .bind(row.id, row.id)
    .all();
  assert.equal(replayRows.results.length, 2);
  assert.ok(
    replayRows.results.some(
      (entry) =>
        entry.id === row.id &&
        entry.state === "dead-letter" &&
        entry.attempt_count === 5,
    ),
  );
  assert.ok(
    replayRows.results.some(
      (entry) =>
        entry.replay_of_notification_id === row.id &&
        entry.state === "pending" &&
        entry.attempt_count === 0,
    ),
  );
  const replayDelivery = new DeterministicAccountNotificationAdapter(
    "2026-07-29T12:15:03.000Z",
  );
  const replayDispatch = await repository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: replayDelivery,
    requestId: "dead-letter-replay-delivery",
    now: "2026-07-29T12:15:03.000Z",
  });
  assert.equal(replayDispatch.delivered, 1);
  assert.notEqual(replayDelivery.deliveries[0].notificationId, row.id);

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
    actor: systemActor,
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

test("delivery deadlines abort adapters and retain a lease before safe recovery", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: "project42-account-notification-deadline" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  const repository = new D1Project42Repository(
    database,
    "notification-deadline",
  );
  const now = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(now);
  const learnerIdentity = verifiedIdentity(
    "deadline-learner",
    "deadline@example.test",
  );
  const learner = await repository.createOrRefreshAccount(
    learnerIdentity,
    false,
    "deadline-signup",
    now,
  );
  await repository.createRegistrationRequest({
    account: learner,
    identity: learnerIdentity,
    receiptTokenDigest: "f".repeat(64),
    requestId: "deadline-registration",
    now,
  });

  let observedAbort = false;
  let attemptedNotificationId;
  const hangingAdapter = {
    kind: "hanging-test",
    deliver(message, context) {
      attemptedNotificationId = message.notificationId;
      return new Promise((_resolve, reject) => {
        context.signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
            reject(new Error("private adapter detail"));
          },
          { once: true },
        );
      });
    },
  };
  const timedOut = await repository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: hangingAdapter,
    requestId: "deadline-dispatch",
    now,
    deliveryDeadlineMs: 100,
  });
  assert.equal(timedOut.outcomeUnknown, 1);
  assert.equal(observedAbort, true);
  const leased = await database
    .prepare(
      `SELECT state, attempt_count, lease_token, lease_expires_at,
              last_error_code
         FROM account_notifications WHERE id = ?`,
    )
    .bind(attemptedNotificationId)
    .first();
  assert.equal(leased.state, "delivering");
  assert.equal(leased.attempt_count, 1);
  assert.ok(leased.lease_token);
  assert.equal(leased.lease_expires_at, "2026-07-29T12:05:00.000Z");
  assert.equal(leased.last_error_code, null);

  const beforeLeaseExpiry = new DeterministicAccountNotificationAdapter(now);
  const unchanged = await repository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: beforeLeaseExpiry,
    requestId: "deadline-no-immediate-retry",
    now: "2026-07-29T12:04:59.000Z",
  });
  assert.equal(unchanged.claimed, 0);
  assert.equal(beforeLeaseExpiry.deliveries.length, 0);

  const recoveredAdapter = new DeterministicAccountNotificationAdapter(
    "2026-07-29T12:05:00.000Z",
  );
  const recovered = await repository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: recoveredAdapter,
    requestId: "deadline-safe-recovery",
    now: "2026-07-29T12:05:00.000Z",
  });
  assert.equal(recovered.recovered, 1);
  assert.equal(recovered.delivered, 1);
  assert.equal(recoveredAdapter.deliveries[0].notificationId, attemptedNotificationId);
  const audits = await database
    .prepare(
      `SELECT action, actor_user_id, metadata_json
         FROM audit_events
        WHERE target_id = ?
        ORDER BY sequence`,
    )
    .bind(attemptedNotificationId)
    .all();
  assert.deepEqual(
    audits.results.map((entry) => entry.action),
    [
      "account-notification.delivery-outcome-unknown",
      "account-notification.lease-recovered",
      "account-notification.delivered",
    ],
  );
  assert.ok(audits.results.every((entry) => entry.actor_user_id === null));
  assert.ok(
    audits.results.every(
      (entry) => !/@|example\.test|private adapter/i.test(entry.metadata_json),
    ),
  );
});

test("a pre-bootstrap registration waits and alerts the first approved owner", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: "project42-account-notification-bootstrap" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  const installationId = "notification-bootstrap";
  const repository = new D1Project42Repository(database, installationId);
  const registrationAt = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(registrationAt);
  const learnerIdentity = verifiedIdentity(
    "bootstrap-learner",
    "bootstrap-learner@example.test",
  );
  const learner = await repository.createOrRefreshAccount(
    learnerIdentity,
    false,
    "bootstrap-learner-signup",
    registrationAt,
  );
  await repository.createRegistrationRequest({
    account: learner,
    identity: learnerIdentity,
    receiptTokenDigest: "1".repeat(64),
    requestId: "bootstrap-registration",
    now: registrationAt,
  });
  const beforeOwnerAdapter = new DeterministicAccountNotificationAdapter(
    registrationAt,
  );
  await repository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: beforeOwnerAdapter,
    requestId: "bootstrap-before-owner",
    now: registrationAt,
  });
  assert.deepEqual(
    beforeOwnerAdapter.deliveries.map((item) => item.kind),
    ["registration-receipt"],
  );
  assert.deepEqual(
    await database
      .prepare(
        `SELECT state, cursor_owner_user_id, recipient_cutoff_at, revision
           FROM account_notification_fanouts`,
      )
      .first(),
    {
      state: "pending",
      cursor_owner_user_id: null,
      recipient_cutoff_at: null,
      revision: 1,
    },
  );

  const ownerAt = "2026-07-29T12:05:00.000Z";
  await repository.createOrRefreshAccount(
    verifiedIdentity("first-owner", "first-owner@example.test"),
    true,
    "first-owner-bootstrap",
    ownerAt,
  );
  const afterOwnerAdapter = new DeterministicAccountNotificationAdapter(
    ownerAt,
  );
  await repository.dispatchAccountNotifications({
    actor: systemActor,
    adapter: afterOwnerAdapter,
    requestId: "bootstrap-after-owner",
    now: ownerAt,
  });
  assert.deepEqual(
    afterOwnerAdapter.deliveries.map((item) => item.kind),
    ["owner-registration-alert"],
  );
  assert.deepEqual(
    await database
      .prepare(
        `SELECT state, cursor_owner_user_id, recipient_cutoff_at, revision
           FROM account_notification_fanouts`,
      )
      .first(),
    {
      state: "complete",
      cursor_owner_user_id: (await database
        .prepare(
          `SELECT id FROM users
            WHERE installation_id = ? AND primary_email = ?`,
        )
        .bind(installationId, "first-owner@example.test")
        .first()).id,
      recipient_cutoff_at: ownerAt,
      revision: 2,
    },
  );
});

test(
  "PostgreSQL rechecks notification recipients before delivery",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const administrationPool = new Pool({
      connectionString: process.env.TEST_POSTGRES_URL,
    });
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const schema = `notification_eligibility_${suffix}`;
    let pool;
    try {
      await administrationPool.query(`CREATE SCHEMA "${schema}"`);
      pool = new Pool({
        connectionString: process.env.TEST_POSTGRES_URL,
        options: `-c search_path=${schema}`,
      });
      await applyPostgresMigrations(pool, "self-host/postgres");
      const database = new PostgresD1CompatibilityDatabase(pool);
      await exerciseDeliveryTimeRecipientEligibility(
        database,
        "postgres-eligibility",
      );
    } finally {
      await pool?.end();
      await administrationPool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await administrationPool.end();
    }
  },
);

test(
  "PostgreSQL correlates notifications to the current request and transition",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const administrationPool = new Pool({
      connectionString: process.env.TEST_POSTGRES_URL,
    });
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const schema = `notification_event_correlation_${suffix}`;
    let pool;
    try {
      await administrationPool.query(`CREATE SCHEMA "${schema}"`);
      pool = new Pool({
        connectionString: process.env.TEST_POSTGRES_URL,
        options: `-c search_path=${schema}`,
      });
      await applyPostgresMigrations(pool, "self-host/postgres");
      const database = new PostgresD1CompatibilityDatabase(pool);
      await exerciseNotificationEventCorrelation(database, "postgres-event");
    } finally {
      await pool?.end();
      await administrationPool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await administrationPool.end();
    }
  },
);

test(
  "PostgreSQL expands the NULL-cursor first page and preserves outbox recovery across restore",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const administrationPool = new Pool({
      connectionString: process.env.TEST_POSTGRES_URL,
    });
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const sourceSchema = `notification_source_${suffix}`;
    const restoredSchema = `notification_restored_${suffix}`;
    let sourcePool;
    let restoredPool;
    try {
      await administrationPool.query(`CREATE SCHEMA "${sourceSchema}"`);
      await administrationPool.query(`CREATE SCHEMA "${restoredSchema}"`);
      sourcePool = new Pool({
        connectionString: process.env.TEST_POSTGRES_URL,
        options: `-c search_path=${sourceSchema}`,
      });
      restoredPool = new Pool({
        connectionString: process.env.TEST_POSTGRES_URL,
        options: `-c search_path=${restoredSchema}`,
      });
      await applyPostgresMigrations(sourcePool, "self-host/postgres");
      await applyPostgresMigrations(restoredPool, "self-host/postgres");
      const sourceDatabase = new PostgresD1CompatibilityDatabase(sourcePool);
      const sourceRepository = new D1Project42Repository(
        sourceDatabase,
        "postgres-notification",
      );
      const now = "2026-07-29T12:00:00.000Z";
      await sourceRepository.ensureInstallation(now);
      const owner = await sourceRepository.createOrRefreshAccount(
        verifiedIdentity("postgres-owner", "postgres-owner@example.test"),
        true,
        "postgres-owner-bootstrap",
        now,
      );
      const learnerIdentity = verifiedIdentity(
        "postgres-learner",
        "postgres-learner@example.test",
      );
      const learner = await sourceRepository.createOrRefreshAccount(
        learnerIdentity,
        false,
        "postgres-learner-signup",
        now,
      );
      await sourceRepository.createRegistrationRequest({
        account: learner,
        identity: learnerIdentity,
        receiptTokenDigest: "2".repeat(64),
        requestId: "postgres-registration",
        now,
      });
      const firstPageAdapter =
        new DeterministicAccountNotificationAdapter(now);
      const firstPage = await sourceRepository.dispatchAccountNotifications({
        actor: {
          kind: "owner",
          userId: owner.id,
          issuer: owner.identity.issuer,
          subject: owner.identity.subject,
        },
        adapter: firstPageAdapter,
        requestId: "postgres-first-page",
        now,
      });
      assert.equal(firstPage.delivered, 2);
      assert.deepEqual(
        new Set(firstPageAdapter.deliveries.map((item) => item.kind)),
        new Set(["registration-receipt", "owner-registration-alert"]),
      );

      const recoveryIds = {
        delivered: "postgres-restored-delivered",
        deadLetter: "postgres-restored-dead-letter",
        delivering: "postgres-restored-delivering",
      };
      await sourceDatabase.batch([
        sourceDatabase
          .prepare(
            `INSERT INTO account_notifications (
               id, installation_id, recipient_user_id, subject_user_id, kind,
               state, template_version, idempotency_key, attempt_count,
               max_attempts, available_at, delivered_at, created_at, updated_at
             ) VALUES (
               ?, ?, ?, ?, 'registration-receipt', 'delivered', '1.0', ?,
               1, 5, ?, ?, ?, ?
             )`,
          )
          .bind(
            recoveryIds.delivered,
            "postgres-notification",
            learner.id,
            learner.id,
            "3".repeat(64),
            now,
            now,
            now,
            now,
          ),
        sourceDatabase
          .prepare(
            `INSERT INTO account_notifications (
               id, installation_id, recipient_user_id, subject_user_id, kind,
               state, template_version, idempotency_key, attempt_count,
               max_attempts, available_at, last_error_code, created_at,
               updated_at
             ) VALUES (
               ?, ?, ?, ?, 'registration-receipt', 'dead-letter', '1.0', ?,
               5, 5, ?, 'delivery-temporary-failure', ?, ?
             )`,
          )
          .bind(
            recoveryIds.deadLetter,
            "postgres-notification",
            learner.id,
            learner.id,
            "4".repeat(64),
            now,
            now,
            now,
          ),
        sourceDatabase
          .prepare(
            `INSERT INTO account_notifications (
               id, installation_id, recipient_user_id, subject_user_id, kind,
               state, template_version, idempotency_key, attempt_count,
               max_attempts, available_at, lease_token, lease_expires_at,
               created_at, updated_at
             ) VALUES (
               ?, ?, ?, ?, 'registration-receipt', 'delivering', '1.0', ?,
               1, 5, ?, 'restored-expired-lease', ?, ?, ?
             )`,
          )
          .bind(
            recoveryIds.delivering,
            "postgres-notification",
            learner.id,
            learner.id,
            "5".repeat(64),
            now,
            "2026-07-29T12:05:00.000Z",
            now,
            now,
          ),
      ]);
      const sourceAuditMaximum = Number(
        (
          await sourcePool.query(
            "SELECT MAX(sequence)::text AS maximum FROM audit_events",
          )
        ).rows[0].maximum,
      );

      const restoreClient = await restoredPool.connect();
      try {
        await restoreClient.query("BEGIN");
        try {
          for (const table of [
            "installations",
            "users",
            "user_identities",
            "role_assignments",
            "approval_decisions",
            "registration_requests",
            "account_notifications",
            "account_notification_fanouts",
            "audit_events",
          ]) {
            const identityOverride =
              table === "audit_events"
                ? " OVERRIDING SYSTEM VALUE"
                : "";
            await restoreClient.query(
              `INSERT INTO "${restoredSchema}"."${table}"${identityOverride}
               SELECT * FROM "${sourceSchema}"."${table}"`,
            );
          }
          await restoreClient.query(
            `SELECT setval(
               pg_get_serial_sequence(
                 '"${restoredSchema}"."audit_events"',
                 'sequence'
               ),
               COALESCE(MAX(sequence), 1),
               MAX(sequence) IS NOT NULL
             )
               FROM "${restoredSchema}"."audit_events"`,
          );
          await restoreClient.query("COMMIT");
        } catch (error) {
          await restoreClient.query("ROLLBACK");
          throw error;
        }
      } finally {
        restoreClient.release();
      }

      const restoredDatabase =
        new PostgresD1CompatibilityDatabase(restoredPool);
      const restoredRepository = new D1Project42Repository(
        restoredDatabase,
        "postgres-notification",
      );
      const restoredAdapter =
        new DeterministicAccountNotificationAdapter(
          "2026-07-29T12:10:00.000Z",
        );
      const restoreRecovery =
        await restoredRepository.dispatchAccountNotifications({
          actor: systemActor,
          adapter: restoredAdapter,
          requestId: "postgres-restore-recovery",
          now: "2026-07-29T12:10:00.000Z",
        });
      assert.equal(restoreRecovery.recovered, 1);
      assert.equal(restoreRecovery.delivered, 1);
      assert.equal(
        restoredAdapter.deliveries[0].notificationId,
        recoveryIds.delivering,
      );
      const restoredStates = await restoredPool.query(
        `SELECT id, state, attempt_count
           FROM account_notifications
          WHERE id = ANY($1::text[])
          ORDER BY id`,
        [Object.values(recoveryIds)],
      );
      assert.deepEqual(
        Object.fromEntries(
          restoredStates.rows.map((row) => [
            row.id,
            { state: row.state, attemptCount: row.attempt_count },
          ]),
        ),
        {
          [recoveryIds.deadLetter]: {
            state: "dead-letter",
            attemptCount: 5,
          },
          [recoveryIds.delivered]: {
            state: "delivered",
            attemptCount: 1,
          },
          [recoveryIds.delivering]: {
            state: "delivered",
            attemptCount: 2,
          },
        },
      );
      assert.deepEqual(
        await restoredRepository.replayDeadLetterAccountNotifications({
          notificationIds: [recoveryIds.deadLetter],
          actor: systemActor,
          requestId: "postgres-restored-dead-letter-replay",
          now: "2026-07-29T12:10:01.000Z",
        }),
        {
          requested: 1,
          replayed: 1,
          alreadyReplayed: 0,
        },
      );
      const restoredAuditMaximum = Number(
        (
          await restoredPool.query(
            "SELECT MAX(sequence)::text AS maximum FROM audit_events",
          )
        ).rows[0].maximum,
      );
      assert.ok(
        restoredAuditMaximum > sourceAuditMaximum,
        "restored notification audits must continue after the restored identity sequence",
      );
    } finally {
      await sourcePool?.end();
      await restoredPool?.end();
      await administrationPool
        .query(`DROP SCHEMA IF EXISTS "${sourceSchema}" CASCADE`)
        .catch(() => undefined);
      await administrationPool
        .query(`DROP SCHEMA IF EXISTS "${restoredSchema}" CASCADE`)
        .catch(() => undefined);
      await administrationPool.end();
    }
  },
);

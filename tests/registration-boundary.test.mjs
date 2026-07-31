import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
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

function synchronizeStateReads(database) {
  let readers = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      if (!/SELECT account_state, state_revision\s+FROM users/.test(sql)) {
        return statement;
      }
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            async first() {
              readers += 1;
              if (readers === 2) release();
              await gate;
              return bound.first();
            },
          };
        },
      };
    },
    batch(statements) {
      return database.batch(statements);
    },
  };
}

test("concurrent stale owner decisions commit exactly one state transition and audit", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-registration-cas" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const installationId = "registration-cas";
  const repository = new D1Project42Repository(database, installationId);
  const now = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(now);
  const ownerIdentity = {
    provider: "oidc",
    issuer: "https://identity.example.test",
    subject: "owner",
    email: "owner@example.test",
    emailVerified: true,
    displayName: "Owner",
    authenticatedAt: 1785326400,
  };
  const learnerIdentity = {
    ...ownerIdentity,
    subject: "pending-learner",
    email: "pending@example.test",
    displayName: "Pending Learner",
  };
  const owner = await repository.createOrRefreshAccount(
    ownerIdentity,
    true,
    "owner-registration",
    now,
  );
  const learner = await repository.createOrRefreshAccount(
    learnerIdentity,
    false,
    "learner-registration",
    now,
  );
  assert.equal(learner.state, "pending");

  const synchronized = new D1Project42Repository(
    synchronizeStateReads(database),
    installationId,
  );
  const results = await Promise.allSettled([
    synchronized.changeAccountState({
      actor: owner,
      targetId: learner.id,
      to: "approved",
      reason: "Approve after owner review.",
      requestId: "concurrent-approve",
      now: "2026-07-29T12:01:00.000Z",
    }),
    synchronized.changeAccountState({
      actor: owner,
      targetId: learner.id,
      to: "rejected",
      reason: "Reject after owner review.",
      requestId: "concurrent-reject",
      now: "2026-07-29T12:01:00.000Z",
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected);
  assert.equal(rejected.reason.code, "account_state_conflict");

  const finalUser = await database
    .prepare(
      `SELECT account_state, state_revision, state_transition_id
         FROM users WHERE installation_id = ? AND id = ?`,
    )
    .bind(installationId, learner.id)
    .first();
  assert.ok(["approved", "rejected"].includes(finalUser.account_state));
  assert.equal(finalUser.state_revision, 2);
  assert.ok(finalUser.state_transition_id);

  const decisions = await database
    .prepare(
      `SELECT id, transition_id, from_state, to_state
         FROM approval_decisions
        WHERE installation_id = ? AND user_id = ?
          AND decision_kind = 'owner-decision' AND from_state IS NOT NULL`,
    )
    .bind(installationId, learner.id)
    .all();
  assert.equal(decisions.results.length, 1);
  assert.equal(decisions.results[0].transition_id, finalUser.state_transition_id);
  assert.equal(decisions.results[0].to_state, finalUser.account_state);

  const audits = await database
    .prepare(
      `SELECT request_id, metadata_json
         FROM audit_events
        WHERE installation_id = ? AND target_id = ?
          AND action = 'account.state.change'`,
    )
    .bind(installationId, learner.id)
    .all();
  assert.equal(audits.results.length, 1);
  assert.match(
    audits.results[0].metadata_json,
    new RegExp(`"to":"${finalUser.account_state}"`),
  );
  const notifications = await database
    .prepare(
      `SELECT kind, state
         FROM account_notifications
        WHERE installation_id = ? AND subject_user_id = ?
          AND kind IN ('learner-approved', 'learner-rejected')`,
    )
    .bind(installationId, learner.id)
    .all();
  assert.equal(notifications.results.length, 1);
  assert.equal(
    notifications.results[0].kind,
    finalUser.account_state === "approved"
      ? "learner-approved"
      : "learner-rejected",
  );
  assert.equal(notifications.results[0].state, "pending");

  await database.exec(
    `INSERT INTO installations VALUES (
       'other-installation', 'Other', '2026-07-29T12:00:00.000Z',
       '2026-07-29T12:00:00.000Z'
     );
     INSERT INTO users (
       id, installation_id, display_name, primary_email, email_verified,
       account_state, created_at, updated_at
     ) VALUES (
       'other-user', 'other-installation', 'Other', NULL, 0, 'pending',
       '2026-07-29T12:00:00.000Z', '2026-07-29T12:00:00.000Z'
     );`.replace(/\r?\n/g, " "),
  );
  await assert.rejects(
    repository.changeAccountState({
      actor: owner,
      targetId: "other-user",
      to: "approved",
      reason: "Cross-installation attempt.",
      requestId: "cross-installation",
      now: "2026-07-29T12:02:00.000Z",
    }),
    (error) => error.code === "account_not_found",
  );
});

test("an enabled domain rule cannot auto-approve while automatic approval is disabled", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-registration-domain-killswitch" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const installationId = "registration-domain-killswitch";
  const now = "2026-07-31T12:00:00.000Z";

  // Seed an enabled rule directly, standing in for one enabled before the flag
  // was cleared or written out of band. The admin routes could not create this
  // while DOMAIN_APPROVAL_ENABLED is false, but the row can still exist.
  const seedRepository = new D1Project42Repository(database, installationId);
  await seedRepository.ensureInstallation(now);
  const owner = await seedRepository.createOrRefreshAccount(
    {
      provider: "oidc",
      issuer: "https://identity.example.test",
      subject: "owner",
      email: "owner@example.test",
      emailVerified: true,
      displayName: "Owner",
      authenticatedAt: 1785326400,
    },
    true,
    "owner-registration",
    now,
  );
  await database
    .prepare(
      `INSERT INTO approved_email_domains (
         id, installation_id, domain, enabled, created_by_user_id,
         created_at, updated_at, policy_version
       ) VALUES (?, ?, ?, 1, ?, ?, ?, 1)`,
    )
    .bind("rule-1", installationId, "trusted.example.test", owner.id, now, now)
    .run();

  const identity = {
    provider: "oidc",
    issuer: "https://identity.example.test",
    subject: "domain-learner",
    email: "learner@trusted.example.test",
    emailVerified: true,
    displayName: "Domain Learner",
    authenticatedAt: 1785326400,
  };

  const repository = new D1Project42Repository(database, installationId);
  const gated = await repository.createOrRefreshAccount(
    identity,
    false,
    "domain-registration",
    now,
    false,
  );
  assert.equal(
    gated.state,
    "pending",
    "a verified exact-domain match must not approve while the kill switch is off",
  );

  const decision = await database
    .prepare(
      "SELECT decision_kind, domain_rule_id FROM approval_decisions WHERE user_id = ?",
    )
    .bind(gated.id)
    .first();
  assert.equal(decision.decision_kind, "registration");
  assert.equal(
    decision.domain_rule_id,
    null,
    "no domain rule may be credited when automatic approval is disabled",
  );

  // The same rule and identity approve once the deployment enables the flag,
  // proving the gate is the only thing standing in the way.
  const approved = await repository.createOrRefreshAccount(
    { ...identity, subject: "domain-learner-2" },
    false,
    "domain-registration-2",
    now,
    true,
  );
  assert.equal(approved.state, "approved");
});

test("revoking access still succeeds when a session was created after the request timestamp", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-revocation-clock-skew" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const installationId = "revocation-clock-skew";
  const repository = new D1Project42Repository(database, installationId);
  const now = "2026-07-31T12:00:00.000Z";
  await repository.ensureInstallation(now);

  const owner = await repository.createOrRefreshAccount(
    {
      provider: "oidc",
      issuer: "https://identity.example.test",
      subject: "owner",
      email: "owner@example.test",
      emailVerified: true,
      displayName: "Owner",
      authenticatedAt: 1785326400,
    },
    true,
    "owner-registration",
    now,
  );
  const learner = await repository.createOrRefreshAccount(
    {
      provider: "oidc",
      issuer: "https://identity.example.test",
      subject: "learner",
      email: "learner@example.test",
      emailVerified: true,
      displayName: "Learner",
      authenticatedAt: 1785326400,
    },
    false,
    "learner-registration",
    now,
  );
  const approved = await repository.changeAccountState({
    actor: owner,
    targetId: learner.id,
    to: "approved",
    reason: "Approve for the revocation fixture.",
    requestId: "approve",
    now,
  });

  // A live session whose created_at is LATER than the timestamp the revoking
  // request will carry. browser_sessions has CHECK (revoked_at >= created_at),
  // so writing the request timestamp directly aborts the batch and the owner's
  // revocation fails outright - leaving the account approved and the session
  // usable. Revocation must never be losable to a clock difference.
  const laterThanRevocation = "2026-07-31T12:05:00.000Z";
  await repository.createBrowserSession({
    account: approved,
    identity: {
      provider: "oidc",
      issuer: "https://identity.example.test",
      subject: "learner",
      email: "learner@example.test",
      emailVerified: true,
      displayName: "Learner",
      authenticatedAt: 1785326400,
    },
    tokenDigest: "a".repeat(64),
    requestId: "create-session",
    now: laterThanRevocation,
  });
  const live = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM browser_sessions WHERE installation_id = ? AND revoked_at IS NULL",
    )
    .bind(installationId)
    .first();
  assert.equal(Number(live.count), 1);

  const revoked = await repository.changeAccountState({
    actor: owner,
    targetId: learner.id,
    to: "revoked",
    reason: "Revoke while a newer session exists.",
    requestId: "revoke",
    now,
  });
  assert.equal(revoked.state, "revoked");

  const remaining = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM browser_sessions WHERE installation_id = ? AND revoked_at IS NULL",
    )
    .bind(installationId)
    .first();
  assert.equal(
    Number(remaining.count),
    0,
    "revocation must leave no usable session behind",
  );

  const stamped = await database
    .prepare(
      "SELECT created_at, revoked_at FROM browser_sessions WHERE installation_id = ?",
    )
    .bind(installationId)
    .first();
  assert.ok(
    stamped.revoked_at >= stamped.created_at,
    "revoked_at must never predate the session it revokes",
  );
});

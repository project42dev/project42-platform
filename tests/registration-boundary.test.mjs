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

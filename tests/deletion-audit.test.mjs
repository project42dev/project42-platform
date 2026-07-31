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

test("completing a deletion records the prior and resulting account state", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-deletion-audit" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const installationId = "deletion-audit";
  const repository = new D1Project42Repository(database, installationId);
  const requestedAt = "2026-07-31T12:00:00.000Z";
  await repository.ensureInstallation(requestedAt);

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
    requestedAt,
  );

  const learner = await repository.createOrRefreshAccount(
    {
      provider: "oidc",
      issuer: "https://identity.example.test",
      subject: "departing-learner",
      email: "departing@example.test",
      emailVerified: true,
      displayName: "Departing Learner",
      authenticatedAt: 1785326400,
    },
    false,
    "learner-registration",
    requestedAt,
  );
  const approved = await repository.changeAccountState({
    actor: owner,
    targetId: learner.id,
    to: "approved",
    reason: "Approved for the deletion audit fixture.",
    requestId: "approve-learner",
    now: requestedAt,
  });
  assert.equal(approved.state, "approved");

  const { deletionRequest } = await repository.requestDeletion({
    account: approved,
    requestId: "request-deletion",
    now: requestedAt,
  });

  // Past the seven-day cancellation deadline.
  const completedAt = "2026-08-10T12:00:00.000Z";
  await repository.completeDeletion({
    actor: owner,
    deletionRequestId: deletionRequest.id,
    reason: "Learner requested permanent deletion.",
    requestId: "complete-deletion",
    now: completedAt,
  });

  const audit = await database
    .prepare(
      `SELECT actor_user_id, reason, occurred_at, metadata_json
         FROM audit_events
        WHERE installation_id = ? AND action = 'deletion.complete'`,
    )
    .bind(installationId)
    .first();
  assert.ok(audit, "a deletion.complete audit event must be written");

  const metadata = JSON.parse(audit.metadata_json);
  assert.equal(
    metadata.from,
    "approved",
    "the account state before deletion must be captured before the row is destroyed",
  );
  assert.equal(metadata.to, "deleted");
  assert.equal(metadata.deletionRequestFrom, "requested");
  assert.equal(metadata.deletionRequestTo, "completed");

  // The rest of the AB#5692 clause: actor, timestamp, and reason.
  assert.equal(audit.actor_user_id, owner.id);
  assert.equal(audit.occurred_at, completedAt);
  assert.equal(audit.reason, "Learner requested permanent deletion.");

  // The audit must not resurrect learner-identifying data.
  assert.doesNotMatch(
    audit.metadata_json,
    /departing@example\.test|departing-learner|Departing Learner/,
    "deletion audit metadata must not retain the deleted learner's identifiers",
  );
});

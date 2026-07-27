import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { starterCatalog } from "../dist/index.js";
import { D1Project42Repository, handleRequest } from "../dist/worker.js";

const issuer = "https://issuer.example.test";
const allowedOrigin = "https://learn.example.test";

function identity(subject, email, emailVerified = true, roles = {}) {
  return {
    issuer,
    subject,
    email,
    emailVerified,
    displayName: roles.displayName ?? subject,
    issuedAt: Math.floor(Date.now() / 1_000),
  };
}

async function readBody(response) {
  return response.json();
}

test("account service completes lifecycle, progress, privacy, and audit journeys on D1", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-26",
    d1Databases: { PROJECT42_DB: "project42-account-e2e" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());

  const database = await miniflare.getD1Database("PROJECT42_DB");
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

  const identities = new Map([
    ["owner-token", identity("owner-subject", "owner@example.test")],
    ["learner-token", identity("learner-subject", "learner@other.example")],
    ["delete-token", identity("delete-subject", "delete@trusted.example")],
    [
      "unverified-token",
      identity("unverified-subject", "unverified@trusted.example", false),
    ],
  ]);
  const verifier = {
    verify: async (request) => {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
      const verified = token ? identities.get(token) : null;
      if (!verified) throw new Error("Test request is missing a known identity.");
      return verified;
    },
  };
  const repository = new D1Project42Repository(database, "e2e");
  const env = {
    INSTALLATION_ID: "e2e",
    ALLOWED_ORIGINS: allowedOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: "owner-subject",
  };

  async function api(token, path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("origin", allowedOrigin);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return handleRequest(
      new Request(`https://api.example.test${path}`, { ...init, headers }),
      env,
      verifier,
      repository,
    );
  }

  const ownerSession = await api("owner-token", "/v1/session", { method: "POST" });
  assert.equal(ownerSession.status, 200);
  const owner = (await readBody(ownerSession)).account;
  assert.equal(owner.state, "approved");
  assert.deepEqual(new Set(owner.roles), new Set(["learner", "owner"]));

  const learnerSession = await api("learner-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(learnerSession.status, 202);
  const learner = (await readBody(learnerSession)).account;
  assert.equal(learner.state, "pending");

  const pendingProgress = await api("learner-token", "/v1/me/progress");
  assert.equal(pendingProgress.status, 403);
  assert.equal((await readBody(pendingProgress)).error.code, "account_pending");

  const accountList = await api("owner-token", "/v1/admin/accounts");
  assert.equal(accountList.status, 200);
  assert.equal((await readBody(accountList)).accounts.length, 2);

  const approved = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "approved",
        reason: "Approved by the end-to-end fixture.",
      }),
    },
  );
  assert.equal(approved.status, 200);
  assert.equal((await readBody(approved)).account.state, "approved");

  const consent = await api("learner-token", "/v1/me/consents", {
    method: "POST",
    body: JSON.stringify({
      purpose: "learner-records",
      policyVersion: "2026-07-27",
      decision: "granted",
    }),
  });
  assert.equal(consent.status, 201);

  const path = starterCatalog.paths[0];
  const moduleId = path.moduleIds[0];
  const progress = {
    schemaVersion: 1,
    displayName: "Lifecycle learner",
    startedPathIds: [path.id],
    completedModuleIds: [moduleId],
    attempts: [
      {
        id: "attempt-e2e-1",
        pathId: path.id,
        moduleId,
        contentVersion: starterCatalog.contentVersion,
        scorePercent: 100,
        passed: true,
        completedAt: "2026-07-27T00:00:00.000Z",
      },
    ],
    badges: [
      {
        id: "badge-e2e",
        name: "E2E badge",
        description: "Evidence that the badge record survived synchronization.",
        earnedAt: "2026-07-27T00:00:00.000Z",
        evidenceModuleIds: [moduleId],
      },
    ],
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
  for (let index = 0; index < 2; index += 1) {
    const imported = await api("learner-token", "/v1/me/progress", {
      method: "POST",
      body: JSON.stringify({
        importId: "browser-import-e2e-1",
        source: "browser-local-v1",
        progress,
      }),
    });
    assert.equal(imported.status, 200);
    assert.equal((await readBody(imported)).progress.revision, 1);
  }

  const synchronized = await api("learner-token", "/v1/me/progress");
  assert.equal(synchronized.status, 200);
  assert.deepEqual((await readBody(synchronized)).progress.progress, progress);

  const learnerExport = await api("learner-token", "/v1/me/export");
  assert.equal(learnerExport.status, 200);
  const exported = (await readBody(learnerExport)).export;
  assert.equal(exported.progress.revision, 1);
  assert.equal(exported.assessmentAttempts.length, 1);
  assert.equal(exported.transcriptEntries.length, starterCatalog.paths.length);
  assert.equal(exported.badges.length, 1);
  assert.equal(exported.consents.length, 1);

  const suspended = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "suspended",
        reason: "Exercise the reversible suspension path.",
      }),
    },
  );
  assert.equal(suspended.status, 200);
  const blocked = await api("learner-token", "/v1/me/progress");
  assert.equal(blocked.status, 403);
  assert.equal((await readBody(blocked)).error.code, "account_suspended");

  const restored = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "approved",
        reason: "Restore access after the suspension fixture.",
      }),
    },
  );
  assert.equal(restored.status, 200);

  const domain = await api("owner-token", "/v1/admin/domains", {
    method: "POST",
    body: JSON.stringify({
      domain: "trusted.example",
      enabled: true,
      reason: "Exercise exact verified-domain approval.",
    }),
  });
  assert.equal(domain.status, 201);

  const deletionSession = await api("delete-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(deletionSession.status, 200);
  const deletionAccount = (await readBody(deletionSession)).account;
  assert.equal(deletionAccount.state, "approved");

  const unverifiedSession = await api("unverified-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(unverifiedSession.status, 202);
  assert.equal((await readBody(unverifiedSession)).account.state, "pending");

  const deletion = await api("delete-token", "/v1/me/deletion", {
    method: "POST",
    body: JSON.stringify({ confirmation: "DELETE MY PROJECT 42 ACCOUNT" }),
  });
  assert.equal(deletion.status, 202);
  const deletionRequest = (await readBody(deletion)).deletionRequest;
  await database
    .prepare(
      "UPDATE deletion_requests SET cancellation_deadline = ? WHERE id = ?",
    )
    .bind("2026-07-26T00:00:00.000Z", deletionRequest.id)
    .run();

  const completedDeletion = await api(
    "owner-token",
    `/v1/admin/deletions/${encodeURIComponent(deletionRequest.id)}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: "Complete the expired end-to-end deletion fixture.",
      }),
    },
  );
  assert.equal(completedDeletion.status, 200);
  assert.equal(
    (
      await database
        .prepare("SELECT COUNT(*) AS count FROM users WHERE id = ?")
        .bind(deletionAccount.id)
        .first()
    ).count,
    0,
  );
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM deletion_tombstones WHERE deletion_request_id = ?",
        )
        .bind(deletionRequest.id)
        .first()
    ).count,
    1,
  );

  const revoked = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "revoked",
        reason: "Exercise terminal revocation after recovery.",
      }),
    },
  );
  assert.equal(revoked.status, 200);
  const revokedProgress = await api("learner-token", "/v1/me/progress");
  assert.equal(revokedProgress.status, 403);
  assert.equal((await readBody(revokedProgress)).error.code, "account_revoked");

  const audit = await api("owner-token", "/v1/admin/audit");
  assert.equal(audit.status, 200);
  const events = (await readBody(audit)).events;
  for (const action of [
    "account.register",
    "account.state.change",
    "consent.record",
    "progress.import",
    "domain.create",
    "deletion.request",
    "deletion.complete",
  ]) {
    assert.ok(events.some((event) => event.action === action), `missing ${action}`);
  }
  assert.ok(events.every((event) => event.requestId));
});

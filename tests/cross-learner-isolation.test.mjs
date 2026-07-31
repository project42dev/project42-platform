import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { D1Project42Repository, handleRequest } from "../dist/worker.js";

const issuer = "https://issuer.example.test";
const allowedOrigin = "https://learn.example.test";
const installationId = "cross-learner-isolation";

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

function identity(subject) {
  const authenticatedAt = Math.floor(Date.now() / 1_000);
  return {
    provider: "oidc",
    issuer,
    subject,
    email: `${subject}@example.test`,
    emailVerified: true,
    displayName: subject,
    issuedAt: authenticatedAt,
    authenticatedAt,
  };
}

test("an approved learner cannot read or change another learner's records", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-cross-learner" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const repository = new D1Project42Repository(database, installationId);
  const now = new Date().toISOString();
  await repository.ensureInstallation(now);

  const identities = new Map();
  const ownerIdentity = identity("owner");
  identities.set("owner-token", ownerIdentity);
  identities.set("alice-token", identity("alice"));
  identities.set("bob-token", identity("bob"));

  const verifier = {
    verify: async (request) => {
      const token = request.headers
        .get("authorization")
        ?.replace(/^Bearer /, "");
      const verified = token ? identities.get(token) : undefined;
      if (!verified) throw new Error("Test request is missing a known identity.");
      return verified;
    },
  };

  const env = {
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: allowedOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: ownerIdentity.subject,
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    PROJECT42_DB: database,
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

  const owner = await repository.createOrRefreshAccount(
    ownerIdentity,
    true,
    "owner-bootstrap",
    now,
  );

  const learners = {};
  for (const name of ["alice", "bob"]) {
    await api(`${name}-token`, "/v1/session", { method: "POST" });
    const account = await repository.findAccount(identities.get(`${name}-token`));
    assert.ok(account);
    await repository.changeAccountState({
      actor: owner,
      targetId: account.id,
      to: "approved",
      reason: `Approve ${name} for the isolation fixture.`,
      requestId: `approve-${name}`,
      now,
    });
    learners[name] = account;
  }

  // Bob records a distinctive display name so any leak into Alice's responses
  // is unambiguous.
  const bobProfile = await api("bob-token", "/v1/me/profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName: "Bob Private Name" }),
  });
  assert.equal(bobProfile.status, 200);

  // Alice is genuinely approved - these denials must come from scope
  // enforcement, not from her lacking access in general.
  const aliceOwn = await api("alice-token", "/v1/me/profile");
  assert.equal(aliceOwn.status, 200);

  // Every selector Alice can put on the wire to name Bob must be refused,
  // across read and write, and must never echo Bob's data.
  const selectors = [
    `userId=${learners.bob.id}`,
    `accountId=${learners.bob.id}`,
    `installationId=${installationId}`,
    `tenantId=${installationId}`,
  ];
  for (const selector of selectors) {
    for (const [method, path] of [
      ["GET", `/v1/me?${selector}`],
      ["GET", `/v1/me/profile?${selector}`],
      ["GET", `/v1/me/progress?${selector}`],
      ["GET", `/v1/me/export?${selector}`],
      ["GET", `/v1/me/identities?${selector}`],
      ["GET", `/v1/me/consents?${selector}`],
      ["GET", `/v1/me/deletion?${selector}`],
    ]) {
      const response = await api("alice-token", path, { method });
      assert.equal(
        response.status,
        403,
        `${method} ${path} must be denied before any record is returned`,
      );
      const body = await response.text();
      assert.doesNotMatch(
        body,
        /Bob Private Name|bob@example\.test/,
        `${method} ${path} must not disclose the other learner`,
      );
      assert.ok(
        !body.includes(learners.bob.id),
        `${method} ${path} must not echo the other learner's identifier`,
      );
    }
  }

  // A mutation carrying another learner's identifier in the body must not move
  // that learner's records either.
  const spoofedWrite = await api("alice-token", "/v1/me/profile", {
    method: "PATCH",
    body: JSON.stringify({
      userId: learners.bob.id,
      accountId: learners.bob.id,
      displayName: "Overwritten By Alice",
    }),
  });
  assert.ok(
    spoofedWrite.status >= 400,
    "unknown identifier fields in a profile update must be rejected",
  );

  // Bob's record is untouched and Alice's own remains her own.
  const bobAfter = await api("bob-token", "/v1/me/profile");
  assert.equal(bobAfter.status, 200);
  assert.equal((await bobAfter.json()).profile.displayName, "Bob Private Name");

  // Owner authority does not leak downward: Alice is approved but not an owner.
  for (const path of [
    "/v1/admin/accounts",
    "/v1/admin/audit",
    "/v1/admin/deletions",
  ]) {
    const response = await api("alice-token", path);
    assert.equal(response.status, 403, `${path} must require owner authority`);
  }
});

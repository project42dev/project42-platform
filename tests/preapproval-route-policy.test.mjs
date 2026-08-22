import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  D1Project42Repository,
  handleRequest,
} from "../dist/worker.js";

const issuer = "https://issuer.example.test";
const allowedOrigin = "https://learn.example.test";
const installationId = "preapproval-route-policy";
const policyVersion = "2026-07-27";

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

function identity(subject, authenticatedAt = Math.floor(Date.now() / 1_000)) {
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

async function tableCounts(database) {
  const tables = [
    "assessment_attempts",
    "browser_sessions",
    "consent_records",
    "deletion_requests",
    "identity_link_transactions",
    "learning_events",
    "learning_progress",
    "module_progress",
    "progress_imports",
    "transcript_entries",
    "user_badges",
    "user_identities",
    "user_profiles",
  ];
  const counts = {};
  for (const table of tables) {
    const row = await database
      .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
      .first();
    counts[table] = Number(row?.count ?? 0);
  }
  return counts;
}

function assertOpaqueStateDisclosure(body, state) {
  assert.deepEqual(body.account, { state });
  assert.equal("id" in body.account, false);
  assert.equal("email" in body.account, false);
  assert.equal("issuer" in body.account, false);
  assert.equal("subject" in body.account, false);
  assert.equal("displayName" in body.account, false);
}

test("non-approved bearer identities have an exhaustive fail-closed self-service boundary", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-26",
    d1Databases: { PROJECT42_DB: "project42-preapproval-route-policy" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());

  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  const repository = new D1Project42Repository(database, installationId);
  await repository.ensureInstallation(new Date().toISOString());

  const identities = new Map();
  const ownerIdentity = identity("owner");
  identities.set("owner-token", ownerIdentity);
  const owner = await repository.createOrRefreshAccount(
    ownerIdentity,
    true,
    "owner-bootstrap",
    new Date().toISOString(),
  );

  for (const state of ["pending", "rejected", "suspended", "revoked"]) {
    identities.set(`${state}-token`, identity(`${state}-learner`));
    identities.set(
      `${state}-stale-token`,
      identity(`${state}-learner`, Math.floor(Date.now() / 1_000) - 73 * 3_600),
    );
  }

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
  const photoCalls = { get: 0, put: 0, delete: 0 };
  const env = {
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: allowedOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: ownerIdentity.subject,
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    PROFILE_PHOTOS: {
      get: async () => {
        photoCalls.get += 1;
        return null;
      },
      put: async () => {
        photoCalls.put += 1;
        return { etag: "unexpected" };
      },
      delete: async () => {
        photoCalls.delete += 1;
      },
    },
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

  const accounts = {};
  for (const state of ["pending", "rejected", "suspended", "revoked"]) {
    const token = `${state}-token`;
    const registration = await api(token, "/v1/session", { method: "POST" });
    assert.equal(registration.status, 202);
    assertOpaqueStateDisclosure(await registration.json(), "pending");
    const learner = await repository.findAccount(identities.get(token));
    assert.ok(learner);
    accounts[state] = learner;

    if (state === "rejected") {
      await repository.changeAccountState({
        actor: owner,
        targetId: learner.id,
        to: "rejected",
        reason: "Create the rejected authorization fixture.",
        requestId: "fixture-rejected",
        now: new Date().toISOString(),
      });
    } else if (state === "suspended") {
      await repository.changeAccountState({
        actor: owner,
        targetId: learner.id,
        to: "approved",
        reason: "Approve the suspended authorization fixture.",
        requestId: "fixture-suspended-approved",
        now: new Date().toISOString(),
      });
      await repository.changeAccountState({
        actor: owner,
        targetId: learner.id,
        to: "suspended",
        reason: "Create the suspended authorization fixture.",
        requestId: "fixture-suspended",
        now: new Date().toISOString(),
      });
    } else if (state === "revoked") {
      await repository.changeAccountState({
        actor: owner,
        targetId: learner.id,
        to: "revoked",
        reason: "Create the revoked authorization fixture.",
        requestId: "fixture-revoked",
        now: new Date().toISOString(),
      });
    }
  }

  const protectedRoutes = [
    { method: "GET", path: "/v1/me/profile" },
    { method: "GET", path: "/v1/me/identities" },
    {
      method: "POST",
      path: "/v1/me/identity-links/github",
      body: JSON.stringify({ returnPath: "/account/" }),
    },
    {
      method: "POST",
      path: "/v1/me/identity-links/github/complete",
      body: JSON.stringify({ invalid: true }),
    },
    {
      method: "POST",
      path: "/v1/me/identity-links",
      body: JSON.stringify({ provider: "github" }),
    },
    { method: "DELETE", path: "/v1/me/identity-links/missing" },
    { method: "DELETE", path: "/v1/me/identities/missing" },
    {
      method: "PATCH",
      path: "/v1/me/profile",
      body: JSON.stringify({ displayName: "Denied mutation" }),
    },
    { method: "GET", path: "/v1/me/profile/photo" },
    {
      method: "PUT",
      path: "/v1/me/profile/photo",
      body: new Uint8Array([1, 2, 3]),
      headers: { "content-type": "image/png" },
    },
    { method: "DELETE", path: "/v1/me/profile/photo" },
    { method: "GET", path: "/v1/me/progress" },
    { method: "GET", path: "/v1/me/transcript.csv" },
    {
      method: "POST",
      path: "/v1/me/progress",
      body: JSON.stringify({ importId: "denied", source: "browser-local-v1" }),
    },
    {
      method: "PUT",
      path: "/v1/me/progress",
      body: JSON.stringify({ importId: "denied", source: "browser-local-v1" }),
    },
    {
      method: "POST",
      path: "/v1/me/consents",
      body: JSON.stringify({
        purpose: "learning-record",
        policyVersion,
        decision: "granted",
      }),
    },
    { method: "POST", path: "/v1/me/account-merge-proof" },
    { method: "POST", path: "/v1/me/account-merges/preview" },
    {
      method: "POST",
      path: "/v1/me/future-protected-route",
      body: JSON.stringify({ shouldNeverBeRead: true }),
    },
  ];

  for (const state of ["pending", "rejected", "suspended", "revoked"]) {
    const token = `${state}-token`;
    const session = await api(token, "/v1/session", { method: "POST" });
    assert.equal(session.status, 202);
    assertOpaqueStateDisclosure(await session.json(), state);

    const authSession = await api(token, "/v1/auth/session");
    assert.equal(authSession.status, 200);
    const authSessionBody = await authSession.json();
    assertOpaqueStateDisclosure(authSessionBody, state);
    assert.equal(authSessionBody.session, null);

    const me = await api(token, "/v1/me");
    assert.equal(me.status, 200);
    assertOpaqueStateDisclosure(await me.json(), state);

    const before = await tableCounts(database);
    for (const route of protectedRoutes) {
      const response = await api(token, route.path, {
        method: route.method,
        ...(route.body === undefined ? {} : { body: route.body }),
        ...(route.headers ? { headers: route.headers } : {}),
      });
      assert.equal(
        response.status,
        403,
        `${state} ${route.method} ${route.path}`,
      );
      assert.equal(
        (await response.json()).error.code,
        `account_${state}`,
        `${state} ${route.method} ${route.path}`,
      );
    }
    assert.deepEqual(await tableCounts(database), before);
  }
  assert.deepEqual(photoCalls, { get: 0, put: 0, delete: 0 });

  const dataRightsRoutes = [
    { method: "GET", path: "/v1/me/consents", status: 200 },
    {
      method: "POST",
      path: "/v1/me/consents",
      status: 201,
      body: JSON.stringify({
        purpose: "product-improvement",
        policyVersion,
        decision: "withdrawn",
      }),
    },
    { method: "GET", path: "/v1/me/export", status: 200 },
    { method: "GET", path: "/v1/me/deletion", status: 200 },
    {
      method: "POST",
      path: "/v1/me/deletion",
      status: 202,
      body: JSON.stringify({ confirmation: "DELETE MY PROJECT 42 ACCOUNT" }),
    },
    { method: "DELETE", path: "/v1/me/deletion", status: 200 },
  ];

  for (const state of ["pending", "rejected", "suspended", "revoked"]) {
    for (const route of dataRightsRoutes) {
      const response = await api(`${state}-token`, route.path, {
        method: route.method,
        ...(route.body === undefined ? {} : { body: route.body }),
      });
      assert.equal(
        response.status,
        route.status,
        `${state} data right ${route.method} ${route.path}`,
      );
    }
  }

  const beforeStaleAttempts = await tableCounts(database);
  for (const route of dataRightsRoutes) {
    const response = await api("pending-stale-token", route.path, {
      method: route.method,
      ...(route.body === undefined ? {} : { body: route.body }),
    });
    assert.equal(
      response.status,
      401,
      `stale data right ${route.method} ${route.path}`,
    );
    assert.equal(
      (await response.json()).error.code,
      "recent_authentication_required",
    );
  }
  assert.deepEqual(await tableCounts(database), beforeStaleAttempts);
});

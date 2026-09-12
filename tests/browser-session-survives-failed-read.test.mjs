// A failed session read must never destroy the session.
//
// The owner reported having to sign in again every time they opened the site.
// The read path has exactly one branch that clears the session cookie -- the
// `session_expired` failure raised when resolveBrowserSession returns null --
// and that branch is correct only while "returned null" means "this session is
// genuinely gone". If a repository fault could be mistaken for an expired
// session, then a single bad minute in D1 would sign every learner out and
// take their cookie with it, and the browser would have no way back other
// than a fresh sign-in.
//
// This test pins the distinction:
//   * repository fault  -> 5xx, and the session cookie is left alone, and the
//                          very next request still works;
//   * session truly gone -> 401 session_expired, and the cookie IS cleared,
//                          because leaving a dead token in the browser just
//                          reproduces the failure on every subsequent load.
//
// It also pins the cookie's security attributes on the clearing path, so a
// future change cannot quietly drop HttpOnly, Secure, SameSite or the
// __Secure- prefix while rewriting this logic.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { D1Project42Repository, handleRequest } from "../dist/worker.js";

const issuer = "https://issuer.example.test";
const origin = "https://learn.example.test";
const installationId = "session-survives-failed-read";
const sessionCookieName = "__Secure-project42_session";

async function applyMigrations(database) {
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

function setCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function sessionCookieFrom(response) {
  return setCookies(response).find((value) =>
    value.startsWith(`${sessionCookieName}=`),
  );
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createSignedInFixture(t, name) {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: `project42-${name}` },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyMigrations(database);
  await database
    .prepare(
      `INSERT INTO installations (id, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(
      installationId,
      "Session persistence test",
      "2020-01-01T00:00:00.000Z",
      "2020-01-01T00:00:00.000Z",
    )
    .run();
  const repository = new D1Project42Repository(database, installationId);

  const nowSeconds = Math.floor(Date.now() / 1_000);
  const identity = {
    provider: "oidc",
    issuer,
    subject: "session-owner",
    email: "owner@example.test",
    emailVerified: true,
    displayName: "Session Owner",
    issuedAt: nowSeconds,
    authenticatedAt: nowSeconds,
  };
  const now = new Date().toISOString();
  const requestId = "fixture-request";
  const account = await repository.createOrRefreshAccount(
    identity,
    true,
    requestId,
    now,
    false,
  );
  assert.equal(
    account.state,
    "approved",
    "The fixture needs an approved account to hold a browser session.",
  );

  const sessionToken = "fixture-session-token-value";
  await repository.createBrowserSession({
    account,
    identity,
    tokenDigest: sha256Hex(sessionToken),
    requestId,
    now,
  });

  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: origin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: identity.subject,
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    SESSION_COOKIE_DOMAIN: ".example.test",
  };
  // A bearer verifier that refuses: every request in this test must be
  // authenticated by the session cookie or not at all. If the worker ever
  // falls through to the bearer path these tests fail loudly instead of
  // silently testing the wrong thing.
  const verifier = {
    verify: async () => {
      throw new Error("This test must authenticate by session cookie only.");
    },
  };

  const api = (path, init = {}, repositoryOverride = repository) => {
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    headers.set("cookie", `${sessionCookieName}=${sessionToken}`);
    headers.set("CF-Connecting-IP", "192.0.2.42");
    return handleRequest(
      new Request(`https://api.example.test${path}`, { ...init, headers }),
      env,
      verifier,
      repositoryOverride,
      undefined,
      undefined,
      undefined,
      { check: async () => ({ allowed: true, retryAfterSeconds: 60 }) },
    );
  };

  return { api, repository, sessionToken };
}

test("a healthy session reads as signed in", async (t) => {
  const { api } = await createSignedInFixture(t, "healthy");
  const response = await api("/v1/auth/session");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.account.state, "approved");
  assert.equal(body.account.primaryEmail, "owner@example.test");
  assert.ok(body.session?.expiresAt, "A signed-in read must report the session expiry.");
});

test("a repository fault does not clear the session cookie or sign the reader out", async (t) => {
  const { api, repository, sessionToken } = await createSignedInFixture(t, "fault");

  // The fault the branch must not mistake for an expired session.
  const faulting = Object.create(repository);
  faulting.resolveBrowserSession = async () => {
    throw new Error("D1_ERROR: Network connection lost.");
  };

  const response = await api("/v1/auth/session", {}, faulting);

  assert.notEqual(
    response.status,
    401,
    "A repository fault must not be reported to the browser as an expired session.",
  );
  assert.ok(
    response.status >= 500,
    `A repository fault is a server failure, got ${response.status}.`,
  );
  assert.equal(
    sessionCookieFrom(response),
    undefined,
    "A failed read must not send any Set-Cookie for the session at all.",
  );

  // The session itself is untouched: the very next request succeeds.
  const recovered = await api("/v1/auth/session");
  assert.equal(recovered.status, 200);
  const body = await recovered.json();
  assert.equal(body.account.state, "approved");

  // And the stored session was never revoked by the failed read.
  const still = await repository.resolveBrowserSession(
    sha256Hex(sessionToken),
    new Date().toISOString(),
    "verify-request",
  );
  assert.ok(still, "The stored browser session must survive a failed read.");
});

test("a genuinely unknown session is cleared, with its security attributes intact", async (t) => {
  const { api, repository } = await createSignedInFixture(t, "expired");

  // The "genuinely gone" case: the repository answers honestly with null
  // rather than failing. Expired, revoked and never-existed all arrive here.
  const gone = Object.create(repository);
  gone.resolveBrowserSession = async () => null;

  const response = await api("/v1/auth/session", {}, gone);

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "session_expired");

  const cookie = sessionCookieFrom(response);
  assert.ok(cookie, "An unknown session token must be cleared from the browser.");
  assert.match(cookie, /^__Secure-project42_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Domain=\.example\.test/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

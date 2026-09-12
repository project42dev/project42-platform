// The whole account-request path, end to end, against the real Worker.
//
// Production evidence for why this file exists: the `users` table of the
// hosted installation held three rows on 2026-09-12, all created within three
// days of each other in July and August 2026, all `approved`, all the owner's
// own addresses. Nobody has ever been `pending` in production. The owner
// himself landed on `approved` instantly because he is the configured
// bootstrap owner. So the request -> pending -> approve path -- the one every
// future learner will take, and the only one a stranger can take -- has never
// been exercised by a real person and was proven by nothing.
//
// Individually, pieces of it were covered: registration-boundary.test.mjs
// pins the concurrency of an owner decision at the repository, and
// account-service-e2e.test.mjs exercises admin routes. Neither drives the
// journey a new person actually takes, through the OIDC callback, over HTTP,
// in the order it happens. That is what this does:
//
//   1. a brand-new identity completing the real callback lands `pending`,
//      is handed a registration receipt, and is NOT handed a session;
//   2. the pending learner can read an honest waiting state, and the shape
//      the front end parses is exactly the shape the Worker emits;
//   3. a pending learner has no access -- the receipt authenticates nothing;
//   4. an owner approval moves the account to approved, and the same identity
//      signing in again now gets a session;
//   5. a rejected request says so plainly -- the receipt reports `rejected`
//      with `contact-owner`, and the callback refuses a session -- rather
//      than failing as a generic error the way it once did (AB#5780).
//
// DOMAIN_APPROVAL_ENABLED is "false" here because that is what the hosted
// Worker runs with. With the flag off there is no auto-approval branch at all,
// so "new identity" and "pending" must be the same statement.

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  BrowserOidcAdapter,
  OidcJwtVerifier,
  handleRequest,
} from "../dist/worker.js";
import {
  parseRegistrationStatus,
  registrationPhaseForInvalidReceipt,
} from "../web/app/lib/registrationStatus.ts";

const issuer = "https://identity.example.test";
const learnOrigin = "https://learn.example.test";
const apiOrigin = "https://api.example.test";
const installationId = "account-request-approval-path";
const sessionCookieName = "__Secure-project42_session";
const receiptCookieName = "__Host-project42_registration";
const transactionCookieName = "__Host-project42_oidc";

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

function setCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function cookieDirective(response, name) {
  return setCookies(response).find((value) => value.startsWith(`${name}=`));
}

/**
 * The `name=value` pair to send back, asserting the value is real.
 *
 * The emptiness check is load-bearing. Clearing a cookie is itself a
 * Set-Cookie with an empty value, so a callback that WRONGLY signed a stranger
 * straight in still emits `__Host-project42_registration=` -- and a test that
 * only looked for the header would happily go on to prove that an empty
 * receipt is refused, which proves nothing at all.
 */
function cookiePair(response, name) {
  const directive = cookieDirective(response, name);
  assert.ok(directive, `Missing ${name} cookie`);
  const pair = directive.split(";", 1)[0];
  assert.notEqual(
    pair,
    `${name}=`,
    `${name} was cleared, not set; this response did not do what the test assumed`,
  );
  return pair;
}

/** A Set-Cookie that erases rather than sets. */
function clearsCookie(response, name) {
  const directive = cookieDirective(response, name);
  if (!directive) return false;
  const value = directive.slice(`${name}=`.length).split(";", 1)[0];
  return value === "";
}

function authOutcome(response) {
  return new URL(response.headers.get("location")).searchParams.get("auth");
}

/**
 * One Worker under test, with the identity provider faked at the two seams the
 * Worker actually uses: the token endpoint, and id_token verification. Nothing
 * else is stubbed -- the D1 repository, the route table, the cookie rules and
 * the authorization checks are the shipped ones.
 */
async function createFixture(t) {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: `project42-${installationId}` },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
    OIDC_ISSUER: issuer,
    OIDC_AUDIENCE: "project42-api",
    OIDC_JWKS_URL: `${issuer}/jwks`,
    OIDC_EMAIL_CLAIM: "email",
    OIDC_EMAIL_VERIFIED_CLAIM: "email_verified",
    // The hosted deployment's value. With it off there is no domain rule that
    // can approve anybody, so a stranger must land pending.
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    ALLOWED_ORIGINS: learnOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: "installation-owner",
    OIDC_AUTHORIZATION_ENDPOINT: `${issuer}/oauth2/v2.0/authorize`,
    OIDC_TOKEN_ENDPOINT: `${issuer}/oauth2/v2.0/token`,
    OIDC_CLIENT_ID: "project42-browser",
    OIDC_REDIRECT_URI: `${apiOrigin}/v1/auth/callback`,
    OIDC_LOGOUT_ENDPOINT: `${issuer}/oauth2/v2.0/logout`,
    // The authorization transaction's code_verifier is stored encrypted, so
    // /v1/auth/start is a 500 without this. A deployment missing it cannot
    // start a sign-in at all.
    SESSION_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  };

  const browserAdapter = new BrowserOidcAdapter(env, async () =>
    Response.json({ id_token: "verified-id-token" }),
  );

  // Which person is at the keyboard for the next callback.
  let currentIdentity = null;
  let expectedNonce = "";
  // The bearer half is the real verifier, so a request carrying no access
  // token is refused exactly the way the deployed Worker refuses it -- a 401
  // raised before any network call. A stub that threw a plain Error would turn
  // every such refusal into a 500 and this file would be asserting on its own
  // scaffolding.
  const bearerVerifier = new OidcJwtVerifier(env);
  const verifier = {
    verify: (request) => bearerVerifier.verify(request),
    verifyToken: async (token, options) => {
      assert.equal(token, "verified-id-token");
      assert.equal(options.nonce, expectedNonce);
      assert.ok(currentIdentity, "no identity was selected for this callback");
      const seconds = Math.floor(Date.now() / 1_000);
      return {
        provider: "oidc",
        issuer,
        ...currentIdentity,
        emailVerified: true,
        issuedAt: seconds,
        authenticatedAt: seconds,
      };
    },
  };

  const api = (url, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", learnOrigin);
    headers.set("CF-Connecting-IP", "192.0.2.42");
    return handleRequest(
      new Request(url, { ...init, headers }),
      env,
      verifier,
      undefined,
      undefined,
      undefined,
      browserAdapter,
      { check: async () => ({ allowed: true, retryAfterSeconds: 60 }) },
    );
  };

  /** Drive a complete browser sign-in for `identity` and return the callback. */
  async function signIn(identity) {
    currentIdentity = identity;
    const start = await api(
      `${apiOrigin}/v1/auth/start?return_to=${encodeURIComponent(`${learnOrigin}/account/`)}`,
    );
    assert.equal(start.status, 302);
    const authorization = new URL(start.headers.get("location"));
    expectedNonce = authorization.searchParams.get("nonce");
    const state = authorization.searchParams.get("state");
    const transaction = cookiePair(start, transactionCookieName);
    return api(
      `${apiOrigin}/v1/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: transaction } },
    );
  }

  return { api, database, signIn };
}

const owner = {
  subject: "installation-owner",
  email: "owner@example.test",
  displayName: "Installation Owner",
};
const stranger = {
  subject: "brand-new-person",
  email: "stranger@example.test",
  displayName: "Brand New Person",
};
const declined = {
  subject: "declined-person",
  email: "declined@example.test",
  displayName: "Declined Person",
};

async function accountStateOf(database, email) {
  const row = await database
    .prepare(
      `SELECT id, account_state FROM users
        WHERE installation_id = ? AND primary_email = ?`,
    )
    .bind(installationId, email)
    .first();
  assert.ok(row, `no users row for ${email}`);
  return row;
}

test("a brand-new identity lands pending and is given no session", async (t) => {
  const { api, database, signIn } = await createFixture(t);

  const callback = await signIn(stranger);

  assert.equal(callback.status, 302);
  assert.equal(
    authOutcome(callback),
    "pending",
    "the browser must be told the request is pending, not that sign-in succeeded",
  );

  const row = await accountStateOf(database, stranger.email);
  assert.equal(
    row.account_state,
    "pending",
    "DOMAIN_APPROVAL_ENABLED is off, so nothing may approve a stranger",
  );

  // A receipt, not a session. This is the distinction the whole waiting state
  // rests on: the browser can ask about its own request and can do nothing
  // else.
  assert.ok(
    cookieDirective(callback, receiptCookieName),
    "a pending request must leave a receipt the browser can come back with",
  );
  assert.ok(
    !cookieDirective(callback, sessionCookieName) ||
      clearsCookie(callback, sessionCookieName),
    "a pending account must never be handed a browser session",
  );

  const receipt = cookiePair(callback, receiptCookieName);
  const receiptDirective = cookieDirective(callback, receiptCookieName);
  assert.ok(receiptDirective.includes("HttpOnly"), "receipt must be HttpOnly");
  assert.ok(receiptDirective.includes("Secure"), "receipt must be Secure");

  // The waiting state itself: honest, specific, and machine-readable.
  const status = await api(`${apiOrigin}/v1/registration/status`, {
    headers: { cookie: receipt },
  });
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.registration.state, "pending");
  assert.equal(body.registration.canSignIn, false);
  assert.equal(body.registration.nextAction, "await-review");

  // And the front end's parser accepts exactly what the Worker emits. This is
  // the seam that decides whether a pending learner sees the waiting card or a
  // broken page: parseRegistrationStatus throws `invalid_registration_status`
  // on anything it does not recognise, and AccountDashboard renders a recovery
  // card rather than the waiting state when it does.
  const parsed = parseRegistrationStatus(body);
  assert.equal(parsed.state, "pending");
  assert.equal(parsed.nextAction, "await-review");
  assert.ok(Date.parse(parsed.requestedAt) > 0);
});

test("a pending learner's receipt authenticates nothing", async (t) => {
  const { api, signIn } = await createFixture(t);
  const callback = await signIn(stranger);
  const receipt = cookiePair(callback, receiptCookieName);

  // Waiting must mean waiting. If the receipt could reach a learner route the
  // pending state would be approval by another name.
  for (const path of ["/v1/auth/session", "/v1/me/profile", "/v1/me/progress"]) {
    const response = await api(`${apiOrigin}${path}`, {
      headers: { cookie: receipt },
    });
    assert.ok(
      response.status === 401 || response.status === 403,
      `${path} answered ${response.status} to a pending receipt; it must refuse`,
    );
  }
});

test("an owner approval moves the request to approved and sign-in then works", async (t) => {
  const { api, database, signIn } = await createFixture(t);

  const ownerCallback = await signIn(owner);
  assert.equal(
    authOutcome(ownerCallback),
    "success",
    "the configured bootstrap owner is the one identity that is approved on sight",
  );
  const ownerSession = cookiePair(ownerCallback, sessionCookieName);

  const pendingCallback = await signIn(stranger);
  const receipt = cookiePair(pendingCallback, receiptCookieName);
  const pending = await accountStateOf(database, stranger.email);

  // Where the request lands for the owner: the admin account list, filtered to
  // pending. This is the only place it surfaces -- see docs/account-approval.md.
  const queue = await api(
    `${apiOrigin}/v1/admin/accounts?state=pending`,
    { headers: { cookie: ownerSession } },
  );
  assert.equal(queue.status, 200);
  const listed = await queue.json();
  assert.ok(
    JSON.stringify(listed).includes(pending.id),
    "a pending request must appear in the owner's pending queue",
  );

  const approval = await api(
    `${apiOrigin}/v1/admin/accounts/${encodeURIComponent(pending.id)}/state`,
    {
      method: "PATCH",
      headers: { cookie: ownerSession, "content-type": "application/json" },
      body: JSON.stringify({
        state: "approved",
        reason: "Approved after owner review.",
      }),
    },
  );
  assert.equal(approval.status, 200, await approval.clone().text());
  assert.equal((await approval.json()).account.state, "approved");

  // The decision destroys the receipt: changeAccountState revokes every
  // registration_request for the account and clears
  // active_registration_request_id. That is deliberate -- a receipt is proof
  // of an OPEN request, and an unauthenticated browser must not be able to
  // keep reading an account's state forever off a cookie. It is also the
  // reason the answer cannot simply appear on the waiting page, and why the
  // copy on /account tells people to sign in again rather than to wait.
  const afterDecision = await api(`${apiOrigin}/v1/registration/status`, {
    headers: { cookie: receipt },
  });
  assert.equal(afterDecision.status, 401);
  assert.equal(
    (await afterDecision.json()).error.code,
    "registration_receipt_invalid",
  );

  // And the sign-in the approval unlocks actually succeeds for the same
  // identity -- which is the only signal an approved learner gets.
  const second = await signIn(stranger);
  assert.equal(authOutcome(second), "success");
  assert.ok(
    cookieDirective(second, sessionCookieName),
    "an approved learner's second sign-in must produce a session",
  );
  assert.equal(
    (await accountStateOf(database, stranger.email)).account_state,
    "approved",
  );
});

test("a rejected request says so rather than failing vaguely", async (t) => {
  const { api, database, signIn } = await createFixture(t);

  const ownerCallback = await signIn(owner);
  const ownerSession = cookiePair(ownerCallback, sessionCookieName);

  const firstCallback = await signIn(declined);
  const firstReceipt = cookiePair(firstCallback, receiptCookieName);
  const account = await accountStateOf(database, declined.email);

  const rejection = await api(
    `${apiOrigin}/v1/admin/accounts/${encodeURIComponent(account.id)}/state`,
    {
      method: "PATCH",
      headers: { cookie: ownerSession, "content-type": "application/json" },
      body: JSON.stringify({
        state: "rejected",
        reason: "Not a member of the reviewed cohort.",
      }),
    },
  );
  assert.equal(rejection.status, 200, await rejection.clone().text());

  // Same as approval: the decision revokes the open request's receipt.
  const afterDecision = await api(`${apiOrigin}/v1/registration/status`, {
    headers: { cookie: firstReceipt },
  });
  assert.equal(afterDecision.status, 401);

  // Signing in again is how a declined person finds out, and the answer is
  // specific rather than a generic failure. Before AB#5780 the front end
  // collapsed every non-pending receipt into "unavailable"; the contract now
  // names the state and names an action.
  const retry = await signIn(declined);
  assert.equal(
    authOutcome(retry),
    "rejected",
    "a declined identity must be told it was declined, not shown a generic error",
  );
  assert.ok(
    !cookieDirective(retry, sessionCookieName) ||
      clearsCookie(retry, sessionCookieName),
    "a rejected identity must never be handed a session",
  );

  const retryReceipt = cookiePair(retry, receiptCookieName);
  const status = await api(`${apiOrigin}/v1/registration/status`, {
    headers: { cookie: retryReceipt },
  });
  assert.equal(status.status, 200);
  const body = await status.json();
  const parsed = parseRegistrationStatus(body);
  assert.equal(parsed.state, "rejected");
  assert.equal(parsed.canSignIn, false);
  assert.equal(
    parsed.nextAction,
    "contact-owner",
    "a decline must point somewhere, not dead-end",
  );
  // The receipt is deliberately reason-free. A private review reason must not
  // leak to an unauthenticated browser holding only a receipt.
  assert.equal(
    JSON.stringify(body).includes("Not a member of the reviewed cohort"),
    false,
    "the receipt must not disclose the owner's private decision reason",
  );

  // And the retry did not quietly reopen the request as pending.
  assert.equal(
    (await accountStateOf(database, declined.email)).account_state,
    "rejected",
  );
});

// The defect the test above exposed, pinned as its own rule.
//
// An owner decision revokes the open request's receipt, so the waiting
// browser's next status read is a 401 -- byte for byte the same 401 a browser
// that never asked for anything receives. The front end used to resolve that
// ambiguity toward "never asked" on any visit that was not immediately after a
// callback, and rendered "Request a Project 42 account". An approved learner
// coming back to check therefore saw an invitation to start over, with nothing
// anywhere on the page suggesting a decision had been made.
test("a decided request is not mistaken for one that was never made", () => {
  // The browser remembers asking: say the receipt is finished, which sends the
  // reader to the one control that can actually find out -- sign in again.
  assert.equal(registrationPhaseForInvalidReceipt(null, true), "expired");
  // It does not: offering the request is the only honest thing left.
  assert.equal(registrationPhaseForInvalidReceipt(null, false), "none");
});

test("a fresh callback outcome still outranks what the browser remembers", () => {
  // Provider and service failures are about this attempt, not about a request
  // that may or may not exist, and must not be dressed up as a decision.
  assert.equal(registrationPhaseForInvalidReceipt("error", true), "provider-error");
  assert.equal(registrationPhaseForInvalidReceipt("invalid", true), "provider-error");
  assert.equal(
    registrationPhaseForInvalidReceipt("unavailable", true),
    "account-unavailable",
  );
  // "pending" with an immediately invalid receipt is a contradiction, not a
  // decision: the callback just claimed to have created the receipt that will
  // not read back.
  assert.equal(registrationPhaseForInvalidReceipt("pending", true), "none");
  // A callback that said "rejected" or "success" was definitely preceded by a
  // request, whatever this browser remembers.
  assert.equal(registrationPhaseForInvalidReceipt("rejected", false), "expired");
  assert.equal(registrationPhaseForInvalidReceipt("success", false), "expired");
});

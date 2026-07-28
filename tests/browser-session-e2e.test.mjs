import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  BrowserOidcAdapter,
  handleRequest,
} from "../dist/worker.js";

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

function cookiePair(cookies, name) {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  assert.ok(cookie, `Missing ${name} cookie`);
  return cookie.split(";", 1)[0];
}

test("browser OIDC flow creates, rotates, and revokes an HttpOnly session", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-browser-session-e2e" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: "browser-session-e2e",
    OIDC_ISSUER: "https://identity.example.test",
    OIDC_AUDIENCE: "project42-api",
    OIDC_JWKS_URL: "https://identity.example.test/jwks",
    OIDC_EMAIL_CLAIM: "email",
    OIDC_EMAIL_VERIFIED_CLAIM: "email_verified",
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    ALLOWED_ORIGINS: "https://learn.example.test",
    BOOTSTRAP_OWNER_ISSUER: "https://identity.example.test",
    BOOTSTRAP_OWNER_SUBJECT: "browser-learner",
    OIDC_AUTHORIZATION_ENDPOINT:
      "https://identity.example.test/oauth2/v2.0/authorize",
    OIDC_TOKEN_ENDPOINT: "https://identity.example.test/oauth2/v2.0/token",
    OIDC_CLIENT_ID: "project42-browser",
    OIDC_REDIRECT_URI: "https://api.example.test/v1/auth/callback",
    OIDC_LOGOUT_ENDPOINT:
      "https://identity.example.test/oauth2/v2.0/logout",
    SESSION_ENCRYPTION_KEY:
      "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  };
  const tokenRequests = [];
  const browserAdapter = new BrowserOidcAdapter(env, async (url, init) => {
    tokenRequests.push({ url, body: new URLSearchParams(init.body) });
    return Response.json({ id_token: "verified-id-token" });
  });
  let expectedNonce = "";
  const verifier = {
    verify: async () => {
      throw new Error("Browser session requests must not require a bearer token.");
    },
    verifyToken: async (token, options) => {
      assert.equal(token, "verified-id-token");
      assert.equal(options.audience, env.OIDC_CLIENT_ID);
      assert.equal(options.nonce, expectedNonce);
      assert.equal(options.requireAuthenticationTime, true);
      return {
        provider: "oidc",
        issuer: env.OIDC_ISSUER,
        subject: "browser-learner",
        email: "learner@example.test",
        emailVerified: true,
        displayName: "Browser Learner",
        issuedAt: Math.floor(Date.now() / 1000),
        authenticatedAt: Math.floor(Date.now() / 1000),
      };
    },
  };
  const api = (request) =>
    handleRequest(
      request,
      env,
      verifier,
      undefined,
      undefined,
      undefined,
      browserAdapter,
    );

  const start = await api(
    new Request(
      "https://api.example.test/v1/auth/start?return_to=" +
        encodeURIComponent("https://learn.example.test/profile/"),
    ),
  );
  assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get("location"));
  const state = authorization.searchParams.get("state");
  expectedNonce = authorization.searchParams.get("nonce");
  assert.ok(state);
  assert.ok(expectedNonce);
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.get("scope"), "openid profile email");
  assert.equal(authorization.searchParams.get("prompt"), "login");
  assert.equal(authorization.searchParams.get("max_age"), "0");
  const transactionCookie = cookiePair(
    setCookies(start),
    "__Host-project42_oidc",
  );

  const wrongState = await api(
    new Request(
      "https://api.example.test/v1/auth/callback?code=test-code&state=wrong",
      { headers: { cookie: transactionCookie } },
    ),
  );
  assert.equal(wrongState.status, 400);
  assert.equal((await wrongState.json()).error.code, "authorization_state_mismatch");

  const callbackResponses = await Promise.all([
    api(
      new Request(
        `https://api.example.test/v1/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie: transactionCookie } },
      ),
    ),
    api(
      new Request(
        `https://api.example.test/v1/auth/callback?code=concurrent-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie: transactionCookie } },
      ),
    ),
  ]);
  assert.deepEqual(
    callbackResponses.map((response) => response.status).sort(),
    [302, 400],
  );
  const callback = callbackResponses.find((response) => response.status === 302);
  const concurrentCallback = callbackResponses.find(
    (response) => response.status === 400,
  );
  assert.ok(callback);
  assert.ok(concurrentCallback);
  assert.equal(
    (await concurrentCallback.json()).error.code,
    "invalid_authorization_transaction",
  );
  assert.equal(callback.status, 302);
  assert.equal(
    new URL(callback.headers.get("location")).searchParams.get("auth"),
    "success",
  );
  const callbackCookies = setCookies(callback);
  const sessionCookie = cookiePair(
    callbackCookies,
    "__Host-project42_session",
  );
  assert.ok(
    callbackCookies.some(
      (value) =>
        value.startsWith("__Host-project42_session=") &&
        value.includes("Secure") &&
        value.includes("HttpOnly") &&
        value.includes("SameSite=Lax") &&
        !value.includes("Domain="),
    ),
  );
  assert.equal(tokenRequests.length, 1);
  assert.equal(tokenRequests[0].body.get("code_verifier")?.length, 64);

  const replay = await api(
    new Request(
      `https://api.example.test/v1/auth/callback?code=replay&state=${encodeURIComponent(state)}`,
      { headers: { cookie: transactionCookie } },
    ),
  );
  assert.equal(replay.status, 400);
  assert.equal(
    (await replay.json()).error.code,
    "invalid_authorization_transaction",
  );

  const session = await api(
    new Request("https://api.example.test/v1/auth/session", {
      headers: {
        cookie: sessionCookie,
        origin: "https://learn.example.test",
      },
    }),
  );
  assert.equal(session.status, 200);
  assert.equal(session.headers.get("access-control-allow-credentials"), "true");
  assert.equal((await session.json()).account.displayName, "Browser Learner");

  const originlessRenewal = await api(
    new Request("https://api.example.test/v1/auth/renew", {
      method: "POST",
      headers: { cookie: sessionCookie },
    }),
  );
  assert.equal(originlessRenewal.status, 403);
  assert.equal((await originlessRenewal.json()).error.code, "origin_required");

  const hostileRenewal = await api(
    new Request("https://api.example.test/v1/auth/renew", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        origin: "https://hostile.example.test",
      },
    }),
  );
  assert.equal(hostileRenewal.status, 403);
  assert.equal((await hostileRenewal.json()).error.code, "origin_not_allowed");

  await database.exec(
    `CREATE TRIGGER reject_session_rotation_audit
       BEFORE INSERT ON audit_events
       WHEN NEW.action = 'session.rotate'
       BEGIN
         SELECT RAISE(ABORT, 'session rotation audit unavailable');
       END;`.replace(/\r?\n/g, " "),
  );
  const auditFailureRenewal = await api(
    new Request("https://api.example.test/v1/auth/renew", {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        origin: "https://learn.example.test",
      },
    }),
  );
  assert.equal(auditFailureRenewal.status, 500);
  const sessionAfterAuditFailure = await api(
    new Request("https://api.example.test/v1/auth/session", {
      headers: { cookie: sessionCookie },
    }),
  );
  assert.equal(sessionAfterAuditFailure.status, 200);
  await database.exec("DROP TRIGGER reject_session_rotation_audit;");

  const renewalResponses = await Promise.all([
    api(
      new Request("https://api.example.test/v1/auth/renew", {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin: "https://learn.example.test",
        },
      }),
    ),
    api(
      new Request("https://api.example.test/v1/auth/renew", {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin: "https://learn.example.test",
        },
      }),
    ),
  ]);
  assert.deepEqual(
    renewalResponses.map((response) => response.status).sort(),
    [200, 409],
  );
  const renewal = renewalResponses.find((response) => response.status === 200);
  const conflictedRenewal = renewalResponses.find(
    (response) => response.status === 409,
  );
  assert.ok(renewal);
  assert.ok(conflictedRenewal);
  assert.equal(
    (await conflictedRenewal.json()).error.code,
    "session_rotation_conflict",
  );
  assert.equal(renewal.status, 200);
  const replacementCookie = cookiePair(
    setCookies(renewal),
    "__Host-project42_session",
  );
  assert.notEqual(replacementCookie, sessionCookie);

  const replaced = await api(
    new Request("https://api.example.test/v1/auth/session", {
      headers: { cookie: sessionCookie },
    }),
  );
  assert.equal(replaced.status, 401);
  assert.equal((await replaced.json()).error.code, "session_expired");
  assert.ok(
    setCookies(replaced).some(
      (value) =>
        value.startsWith("__Host-project42_session=") &&
        value.includes("Max-Age=0"),
    ),
  );

  const signout = await api(
    new Request(
      "https://api.example.test/v1/auth/signout?return_to=" +
        encodeURIComponent("https://learn.example.test/"),
      {
        method: "POST",
        headers: {
          cookie: replacementCookie,
          origin: "https://learn.example.test",
        },
      },
    ),
  );
  assert.equal(signout.status, 200);
  const signoutBody = await signout.json();
  assert.equal(signoutBody.signedOut, true);
  assert.equal(
    new URL(signoutBody.logoutUrl).searchParams.get(
      "post_logout_redirect_uri",
    ),
    "https://learn.example.test/",
  );
  assert.ok(
    setCookies(signout).some(
      (value) =>
        value.startsWith("__Host-project42_session=") &&
        value.includes("Max-Age=0"),
    ),
  );

  const revoked = await api(
    new Request("https://api.example.test/v1/auth/session", {
      headers: { cookie: replacementCookie },
    }),
  );
  assert.equal(revoked.status, 401);
  assert.equal((await revoked.json()).error.code, "session_expired");

  const recoverInvalidCookie = await api(
    new Request("https://api.example.test/v1/auth/signout", {
      method: "POST",
      headers: {
        cookie: "__Host-project42_session=unknown-session",
        origin: "https://learn.example.test",
      },
    }),
  );
  assert.equal(recoverInvalidCookie.status, 200);
  assert.equal((await recoverInvalidCookie.json()).signedOut, true);
  assert.ok(
    setCookies(recoverInvalidCookie).some(
      (value) =>
        value.startsWith("__Host-project42_session=") &&
      value.includes("Max-Age=0"),
    ),
  );

  const cancelledStart = await api(
    new Request("https://api.example.test/v1/auth/start"),
  );
  const cancelledAuthorization = new URL(
    cancelledStart.headers.get("location"),
  );
  const cancelledState = cancelledAuthorization.searchParams.get("state");
  const cancelledTransactionCookie = cookiePair(
    setCookies(cancelledStart),
    "__Host-project42_oidc",
  );
  const cancelledCallback = await api(
    new Request(
      `https://api.example.test/v1/auth/callback?error=access_denied&state=${encodeURIComponent(cancelledState)}`,
      { headers: { cookie: cancelledTransactionCookie } },
    ),
  );
  assert.equal(cancelledCallback.status, 302);
  assert.equal(
    new URL(cancelledCallback.headers.get("location")).searchParams.get("auth"),
    "error",
  );
  const cancelledReplay = await api(
    new Request(
      `https://api.example.test/v1/auth/callback?code=retry-after-cancel&state=${encodeURIComponent(cancelledState)}`,
      { headers: { cookie: cancelledTransactionCookie } },
    ),
  );
  assert.equal(cancelledReplay.status, 400);
  assert.equal(
    (await cancelledReplay.json()).error.code,
    "invalid_authorization_transaction",
  );
  assert.equal(tokenRequests.length, 1);
});

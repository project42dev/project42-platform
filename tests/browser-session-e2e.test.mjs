import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  BrowserOidcAdapter,
  D1Project42Repository,
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
    const body = new URLSearchParams(init.body);
    tokenRequests.push({ url, body });
    if (body.get("code") === "provider-rejected-code") {
      return Response.json(
        {
          error: "invalid_grant",
          error_description:
            "No account exists for sensitive-identity@example.test.",
        },
        { status: 400 },
      );
    }
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
  const api = (request) => {
    const headers = new Headers(request.headers);
    headers.set("CF-Connecting-IP", "192.0.2.42");
    return handleRequest(
      new Request(request, { headers }),
      env,
      verifier,
      undefined,
      undefined,
      undefined,
      browserAdapter,
      {
        check: async () => ({ allowed: true, retryAfterSeconds: 60 }),
      },
    );
  };

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
    "__Secure-project42_session",
  );
  assert.ok(
    callbackCookies.some(
      (value) =>
        value.startsWith("__Secure-project42_session=") &&
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

  await database
    .prepare(
      `DELETE FROM role_assignments
        WHERE installation_id = ? AND user_id = (
          SELECT user_id
            FROM user_identities
           WHERE installation_id = ? AND issuer = ? AND subject = ?
        )`,
    )
    .bind(
      env.INSTALLATION_ID,
      env.INSTALLATION_ID,
      env.OIDC_ISSUER,
      "browser-learner",
    )
    .run();
  const staleRoleSession = await api(
    new Request("https://api.example.test/v1/me/profile", {
      headers: {
        cookie: sessionCookie,
        origin: "https://learn.example.test",
      },
    }),
  );
  assert.equal(staleRoleSession.status, 403);
  assert.equal(
    (await staleRoleSession.json()).error.code,
    "role_assignment_invalid",
  );
  await database
    .prepare(
      `INSERT INTO role_assignments (
         installation_id, user_id, role, assigned_by_user_id, assigned_at
       )
       SELECT ?, user_id, ?, user_id, ?
         FROM user_identities
        WHERE installation_id = ? AND issuer = ? AND subject = ?`,
    )
    .bind(
      env.INSTALLATION_ID,
      "learner",
      new Date().toISOString(),
      env.INSTALLATION_ID,
      env.OIDC_ISSUER,
      "browser-learner",
    )
    .run();
  await database
    .prepare(
      `INSERT INTO role_assignments (
         installation_id, user_id, role, assigned_by_user_id, assigned_at
       )
       SELECT ?, user_id, ?, user_id, ?
         FROM user_identities
        WHERE installation_id = ? AND issuer = ? AND subject = ?`,
    )
    .bind(
      env.INSTALLATION_ID,
      "owner",
      new Date().toISOString(),
      env.INSTALLATION_ID,
      env.OIDC_ISSUER,
      "browser-learner",
    )
    .run();

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
  const rotationRows = await database
    .prepare(
      `SELECT
         count(*) AS total,
         sum(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active
       FROM browser_sessions
       WHERE installation_id = ?`,
    )
    .bind(env.INSTALLATION_ID)
    .first();
  assert.deepEqual(
    {
      total: Number(rotationRows.total),
      active: Number(rotationRows.active),
    },
    { total: 2, active: 1 },
  );
  assert.equal(renewal.status, 200);
  const replacementCookie = cookiePair(
    setCookies(renewal),
    "__Secure-project42_session",
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
        value.startsWith("__Secure-project42_session=") &&
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
        value.startsWith("__Secure-project42_session=") &&
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
        cookie: "__Secure-project42_session=unknown-session",
        origin: "https://learn.example.test",
      },
    }),
  );
  assert.equal(recoverInvalidCookie.status, 200);
  assert.equal((await recoverInvalidCookie.json()).signedOut, true);
  assert.ok(
    setCookies(recoverInvalidCookie).some(
      (value) =>
        value.startsWith("__Secure-project42_session=") &&
        value.includes("Max-Age=0"),
    ),
  );

  const rejectedStart = await api(
    new Request("https://api.example.test/v1/auth/start"),
  );
  const rejectedAuthorization = new URL(
    rejectedStart.headers.get("location"),
  );
  const rejectedState = rejectedAuthorization.searchParams.get("state");
  const rejectedTransactionCookie = cookiePair(
    setCookies(rejectedStart),
    "__Host-project42_oidc",
  );
  const rejectedCallback = await api(
    new Request(
      `https://api.example.test/v1/auth/callback?code=provider-rejected-code&state=${encodeURIComponent(rejectedState)}`,
      { headers: { cookie: rejectedTransactionCookie } },
    ),
  );
  assert.equal(rejectedCallback.status, 400);
  const rejectedBody = await rejectedCallback.json();
  assert.deepEqual(
    {
      code: rejectedBody.error.code,
      message: rejectedBody.error.message,
    },
    {
      code: "authorization_code_rejected",
      message: "Sign-in could not be completed. Start sign-in again.",
    },
  );
  assert.doesNotMatch(
    JSON.stringify(rejectedBody),
    /sensitive-identity|invalid_grant|no account exists/i,
  );

  const providerFailures = [
    {
      error: "access_denied",
      description: "No account exists for first-sensitive@example.test.",
    },
    {
      error: "login_required",
      description: "Account second-sensitive@example.test was disabled.",
    },
  ];
  const failedTransactions = [];
  for (const failure of providerFailures) {
    const failedStart = await api(
      new Request("https://api.example.test/v1/auth/start"),
    );
    const failedAuthorization = new URL(failedStart.headers.get("location"));
    const failedState = failedAuthorization.searchParams.get("state");
    const failedTransactionCookie = cookiePair(
      setCookies(failedStart),
      "__Host-project42_oidc",
    );
    const failedCallbackTarget = new URL(
      "https://api.example.test/v1/auth/callback",
    );
    failedCallbackTarget.searchParams.set("error", failure.error);
    failedCallbackTarget.searchParams.set(
      "error_description",
      failure.description,
    );
    failedCallbackTarget.searchParams.set("state", failedState);
    const failedCallback = await api(
      new Request(failedCallbackTarget, {
        headers: { cookie: failedTransactionCookie },
      }),
    );
    assert.equal(failedCallback.status, 302);
    assert.equal(
      failedCallback.headers.get("location"),
      "https://learn.example.test/account/?auth=error",
    );
    assert.doesNotMatch(
      failedCallback.headers.get("location"),
      /sensitive|access_denied|login_required/i,
    );
    failedTransactions.push({
      state: failedState,
      cookie: failedTransactionCookie,
    });
  }

  const cancelledReplay = await api(
    new Request(
      `https://api.example.test/v1/auth/callback?code=retry-after-cancel&state=${encodeURIComponent(failedTransactions[0].state)}`,
      { headers: { cookie: failedTransactions[0].cookie } },
    ),
  );
  assert.equal(cancelledReplay.status, 400);
  assert.equal(
    (await cancelledReplay.json()).error.code,
    "invalid_authorization_transaction",
  );
  assert.equal(tokenRequests.length, 2);
});

test("pending and rejected OIDC callbacks receive only an installation-scoped status receipt", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-registration-boundary-e2e" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: "registration-boundary-e2e",
    OIDC_ISSUER: "https://identity.example.test",
    OIDC_AUDIENCE: "project42-api",
    OIDC_JWKS_URL: "https://identity.example.test/jwks",
    OIDC_EMAIL_CLAIM: "email",
    OIDC_EMAIL_VERIFIED_CLAIM: "email_verified",
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    ALLOWED_ORIGINS: "https://learn.example.test",
    BOOTSTRAP_OWNER_ISSUER: "https://identity.example.test",
    BOOTSTRAP_OWNER_SUBJECT: "different-owner",
    OIDC_AUTHORIZATION_ENDPOINT:
      "https://identity.example.test/oauth2/v2.0/authorize",
    OIDC_TOKEN_ENDPOINT: "https://identity.example.test/oauth2/v2.0/token",
    OIDC_CLIENT_ID: "project42-browser",
    OIDC_REDIRECT_URI: "https://api.example.test/v1/auth/callback",
    SESSION_ENCRYPTION_KEY:
      "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  };
  let expectedNonce = "";
  const verifier = {
    verify: async () => ({
      provider: "oidc",
      issuer: env.OIDC_ISSUER,
      subject: "unregistered-bearer",
      email: null,
      emailVerified: false,
      displayName: null,
      authenticatedAt: Math.floor(Date.now() / 1000),
    }),
    verifyToken: async (_token, options) => {
      assert.equal(options.nonce, expectedNonce);
      return {
        provider: "oidc",
        issuer: env.OIDC_ISSUER,
        subject: "pending-learner",
        email: "pending@example.test",
        emailVerified: true,
        displayName: "Pending Learner",
        authenticatedAt: Math.floor(Date.now() / 1000),
      };
    },
  };
  const api = (request, environment = env) => {
    const headers = new Headers(request.headers);
    headers.set("CF-Connecting-IP", "192.0.2.43");
    return handleRequest(
      new Request(request, { headers }),
      environment,
      verifier,
      undefined,
      undefined,
      undefined,
      new BrowserOidcAdapter(environment, async () =>
        Response.json({ id_token: "verified-id-token" }),
      ),
      {
        check: async () => ({ allowed: true, retryAfterSeconds: 60 }),
      },
    );
  };
  const signIn = async () => {
    const start = await api(
      new Request(
        "https://api.example.test/v1/auth/start?return_to=" +
        encodeURIComponent("https://learn.example.test/account/"),
      ),
    );
    const authorization = new URL(start.headers.get("location"));
    expectedNonce = authorization.searchParams.get("nonce");
    const state = authorization.searchParams.get("state");
    const transactionCookie = cookiePair(
      setCookies(start),
      "__Host-project42_oidc",
    );
    return api(
      new Request(
        `https://api.example.test/v1/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie: transactionCookie } },
      ),
    );
  };

  const pendingCallback = await signIn();
  assert.equal(pendingCallback.status, 302);
  assert.equal(
    new URL(pendingCallback.headers.get("location")).searchParams.get("auth"),
    "pending",
  );
  const pendingCookies = setCookies(pendingCallback);
  const receiptCookie = cookiePair(
    pendingCookies,
    "__Host-project42_registration",
  );
  assert.ok(
    pendingCookies.some(
      (value) =>
        value.startsWith("__Host-project42_registration=") &&
        value.includes("Secure") &&
        value.includes("HttpOnly") &&
        value.includes("SameSite=Lax") &&
        !value.includes("Domain="),
    ),
  );
  assert.ok(
    !pendingCookies.some(
      (value) =>
        value.startsWith("__Secure-project42_session=") &&
        !value.startsWith("__Secure-project42_session=;"),
    ),
  );
  assert.equal(
    (
      await database
        .prepare("SELECT COUNT(*) AS count FROM browser_sessions")
        .first()
    ).count,
    0,
  );

  const pendingStatus = await api(
    new Request("https://api.example.test/v1/registration/status", {
      headers: { cookie: receiptCookie },
    }),
  );
  assert.equal(pendingStatus.status, 200);
  const pendingBody = await pendingStatus.json();
  assert.deepEqual(
    {
      state: pendingBody.registration.state,
      canSignIn: pendingBody.registration.canSignIn,
      nextAction: pendingBody.registration.nextAction,
    },
    { state: "pending", canSignIn: false, nextAction: "await-review" },
  );
  const serializedStatus = JSON.stringify(pendingBody);
  assert.doesNotMatch(serializedStatus, /pending@example\.test/);
  assert.doesNotMatch(serializedStatus, /pending-learner/);
  for (const protectedPath of ["/v1/me/progress", "/v1/admin/accounts"]) {
    const bypass = await api(
      new Request(`https://api.example.test${protectedPath}`, {
        headers: { cookie: receiptCookie },
      }),
    );
    assert.equal(bypass.status, 401);
    assert.equal((await bypass.json()).error.code, "account_not_registered");
  }

  const receiptValue = receiptCookie.split("=")[1];
  const invalidReceiptValue = `${receiptValue.slice(0, -1)}${receiptValue.endsWith("A") ? "B" : "A"
    }`;
  const invalidReceipt = await api(
    new Request("https://api.example.test/v1/registration/status", {
      headers: {
        cookie: `__Host-project42_registration=${invalidReceiptValue}`,
      },
    }),
  );
  assert.equal(invalidReceipt.status, 401);
  assert.equal(
    (await invalidReceipt.json()).error.code,
    "registration_receipt_invalid",
  );
  assert.ok(
    setCookies(invalidReceipt).some((value) =>
      value.startsWith("__Host-project42_registration=;"),
    ),
  );

  const repeatedPendingCallback = await signIn();
  const rotatedReceiptCookie = cookiePair(
    setCookies(repeatedPendingCallback),
    "__Host-project42_registration",
  );
  const rotatedReceiptValue = rotatedReceiptCookie.split("=")[1];
  assert.notEqual(rotatedReceiptValue, receiptValue);
  const replacedReceipt = await api(
    new Request("https://api.example.test/v1/registration/status", {
      headers: { cookie: receiptCookie },
    }),
  );
  assert.equal(replacedReceipt.status, 401);
  assert.ok(
    setCookies(replacedReceipt).some((value) =>
      value.startsWith("__Host-project42_registration=;"),
    ),
  );
  const receiptRows = await database
    .prepare(
      `SELECT id, receipt_token_digest, revoked_at, replaced_by_request_id
         FROM registration_requests
        WHERE installation_id = ?
        ORDER BY requested_at, id`,
    )
    .bind(env.INSTALLATION_ID)
    .all();
  assert.equal(receiptRows.results.length, 2);
  const activeReceiptRow = receiptRows.results.find(
    (row) => row.revoked_at === null,
  );
  const replacedReceiptRow = receiptRows.results.find(
    (row) => row.revoked_at !== null,
  );
  assert.ok(activeReceiptRow);
  assert.ok(replacedReceiptRow);
  assert.equal(replacedReceiptRow.replaced_by_request_id, activeReceiptRow.id);
  assert.equal(activeReceiptRow.receipt_token_digest, sha256(rotatedReceiptValue));

  await database
    .prepare(
      `UPDATE registration_requests
          SET requested_at = ?, expires_at = ?
        WHERE installation_id = ? AND receipt_token_digest = ?`,
    )
    .bind(
      "2026-07-27T00:00:00.000Z",
      "2026-07-28T00:00:00.000Z",
      env.INSTALLATION_ID,
      sha256(rotatedReceiptValue),
    )
    .run();
  const expiredReceipt = await api(
    new Request("https://api.example.test/v1/registration/status", {
      headers: { cookie: rotatedReceiptCookie },
    }),
  );
  assert.equal(expiredReceipt.status, 401);
  assert.ok(
    setCookies(expiredReceipt).some((value) =>
      value.startsWith("__Host-project42_registration=;"),
    ),
  );

  const currentPendingCallback = await signIn();
  const currentReceiptCookie = cookiePair(
    setCookies(currentPendingCallback),
    "__Host-project42_registration",
  );
  const currentReceiptValue = currentReceiptCookie.split("=")[1];

  const acceptanceRequest = () =>
    api(
      new Request(
        "https://api.example.test/v1/registration/terms-acceptance",
        {
          method: "POST",
          headers: {
            cookie: currentReceiptCookie,
            origin: "https://learn.example.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            termsVersion: "1.0",
            acceptedAt: "2026-07-29T12:00:00.000Z",
          }),
        },
      ),
    );
  const accepted = await acceptanceRequest();
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).acceptance.purpose, "terms-of-service");
  const acceptedRetry = await acceptanceRequest();
  assert.equal(acceptedRetry.status, 201);
  const acceptanceRows = await database
    .prepare(
      `SELECT id FROM consent_records
        WHERE installation_id = ? AND purpose = 'terms-of-service'`,
    )
    .bind(env.INSTALLATION_ID)
    .all();
  assert.equal(acceptanceRows.results.length, 1);

  const user = await database
    .prepare(
      "SELECT id FROM users WHERE installation_id = ? AND account_state = 'pending'",
    )
    .bind(env.INSTALLATION_ID)
    .first();
  assert.ok(user?.id);
  const otherInstallation = {
    ...env,
    INSTALLATION_ID: "other-registration-installation",
  };
  const crossInstallation = await api(
    new Request("https://api.example.test/v1/registration/status", {
      headers: { cookie: currentReceiptCookie },
    }),
    otherInstallation,
  );
  assert.equal(crossInstallation.status, 401);

  const staleToken = "stale-browser-session-token-with-enough-entropy-123456789";
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  await database
    .prepare(
      `INSERT INTO browser_sessions (
         id, installation_id, user_id, token_digest, identity_issuer,
         identity_subject, authenticated_at, created_at, last_seen_at,
         expires_at, absolute_expires_at, revoked_at, replaced_by_session_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .bind(
      "stale-session",
      env.INSTALLATION_ID,
      user.id,
      sha256(staleToken),
      env.OIDC_ISSUER,
      "pending-learner",
      Math.floor(now.getTime() / 1000),
      nowIso,
      nowIso,
      expiresAt,
      expiresAt,
    )
    .run();
  const staleSession = await api(
    new Request("https://api.example.test/v1/auth/session", {
      headers: {
        cookie: `__Secure-project42_session=${staleToken}`,
        origin: "https://learn.example.test",
      },
    }),
  );
  assert.equal(staleSession.status, 401);
  assert.equal((await staleSession.json()).error.code, "session_expired");
  assert.ok(
    (
      await database
        .prepare("SELECT revoked_at FROM browser_sessions WHERE id = ?")
        .bind("stale-session")
        .first()
    ).revoked_at,
  );

  const repository = new D1Project42Repository(
    database,
    env.INSTALLATION_ID,
  );
  const ownerIdentity = {
    provider: "oidc",
    issuer: env.OIDC_ISSUER,
    subject: "registration-owner",
    email: "owner@example.test",
    emailVerified: true,
    displayName: "Registration Owner",
    authenticatedAt: Math.floor(now.getTime() / 1000),
  };
  const owner = await repository.createOrRefreshAccount(
    ownerIdentity,
    true,
    "registration-owner-bootstrap",
    nowIso,
  );
  await repository.changeAccountState({
    actor: owner,
    targetId: user.id,
    to: "rejected",
    reason: "Reject the registration lifecycle fixture.",
    requestId: "registration-reject",
    now: new Date(now.getTime() + 1000).toISOString(),
  });
  const receiptAfterRejection = await api(
    new Request("https://api.example.test/v1/registration/status", {
      headers: { cookie: currentReceiptCookie },
    }),
  );
  assert.equal(receiptAfterRejection.status, 401);

  const rejectedCallback = await signIn();
  assert.equal(
    new URL(rejectedCallback.headers.get("location")).searchParams.get("auth"),
    "rejected",
  );
  const rejectedReceiptCookie = cookiePair(
    setCookies(rejectedCallback),
    "__Host-project42_registration",
  );
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM browser_sessions WHERE revoked_at IS NULL",
        )
        .first()
    ).count,
    0,
  );

  await repository.changeAccountState({
    actor: owner,
    targetId: user.id,
    to: "approved",
    reason: "Approve the registration lifecycle fixture.",
    requestId: "registration-approve",
    now: new Date(now.getTime() + 2000).toISOString(),
  });
  const receiptAfterApproval = await api(
    new Request("https://api.example.test/v1/registration/status", {
      headers: { cookie: rejectedReceiptCookie },
    }),
  );
  assert.equal(receiptAfterApproval.status, 401);

  const approvedCallback = await signIn();
  assert.equal(
    new URL(approvedCallback.headers.get("location")).searchParams.get("auth"),
    "success",
  );
  const approvedSessionCookie = cookiePair(
    setCookies(approvedCallback),
    "__Secure-project42_session",
  );
  assert.ok(
    setCookies(approvedCallback).some(
      (value) =>
        value.startsWith("__Secure-project42_session=") &&
        !value.startsWith("__Secure-project42_session=;"),
    ),
  );

  await repository.changeAccountState({
    actor: owner,
    targetId: user.id,
    to: "suspended",
    reason: "Suspend the registration lifecycle fixture.",
    requestId: "registration-suspend",
    now: new Date(now.getTime() + 3000).toISOString(),
  });
  const suspendedSession = await api(
    new Request("https://api.example.test/v1/auth/session", {
      headers: {
        cookie: approvedSessionCookie,
        origin: "https://learn.example.test",
      },
    }),
  );
  assert.equal(suspendedSession.status, 401);
  const suspendedCallback = await signIn();
  assert.equal(
    new URL(suspendedCallback.headers.get("location")).searchParams.get("auth"),
    "unavailable",
  );
  assert.ok(
    setCookies(suspendedCallback).some((value) =>
      value.startsWith("__Host-project42_registration=;"),
    ),
  );

  await repository.changeAccountState({
    actor: owner,
    targetId: user.id,
    to: "approved",
    reason: "Restore the registration lifecycle fixture.",
    requestId: "registration-restore",
    now: new Date(now.getTime() + 4000).toISOString(),
  });
  const restoredCallback = await signIn();
  const restoredSessionCookie = cookiePair(
    setCookies(restoredCallback),
    "__Secure-project42_session",
  );
  await repository.changeAccountState({
    actor: owner,
    targetId: user.id,
    to: "revoked",
    reason: "Revoke the registration lifecycle fixture.",
    requestId: "registration-revoke",
    now: new Date(now.getTime() + 5000).toISOString(),
  });
  const revokedSession = await api(
    new Request("https://api.example.test/v1/auth/session", {
      headers: {
        cookie: restoredSessionCookie,
        origin: "https://learn.example.test",
      },
    }),
  );
  assert.equal(revokedSession.status, 401);
  const revokedCallback = await signIn();
  assert.equal(
    new URL(revokedCallback.headers.get("location")).searchParams.get("auth"),
    "unavailable",
  );
  assert.ok(
    setCookies(revokedCallback).some((value) =>
      value.startsWith("__Host-project42_registration=;"),
    ),
  );

  const audit = await database
    .prepare(
      `SELECT action, metadata_json
         FROM audit_events
        WHERE installation_id = ?
          AND action IN ('registration.request', 'session.revoke.account-state')
        ORDER BY occurred_at`,
    )
    .bind(env.INSTALLATION_ID)
    .all();
  assert.ok(
    audit.results.some((event) => event.action === "registration.request"),
  );
  assert.ok(
    audit.results.some(
      (event) => event.action === "session.revoke.account-state",
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(audit.results),
    new RegExp(receiptValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.doesNotMatch(
    JSON.stringify(audit.results),
    new RegExp(currentReceiptValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

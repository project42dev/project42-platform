import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  BrowserOidcAdapter,
  OidcJwtVerifier,
  handleRequest,
} from "../dist/worker.js";

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

test("expired browser identity tokens fail closed and return the learner to a restartable flow", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const server = createServer((request, response) => {
    if (request.url !== "/jwks") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        keys: [{ ...jwk, kid: "expiry-test-key", use: "sig", alg: "RS256" }],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const issuer = "https://issuer.example.test";
  const env = {
    INSTALLATION_ID: "expiry-recovery-test",
    ALLOWED_ORIGINS: "https://learn.example.test",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    OIDC_ISSUER: issuer,
    OIDC_AUDIENCE: "project42-api",
    OIDC_JWKS_URL: `http://127.0.0.1:${address.port}/jwks`,
    OIDC_EMAIL_CLAIM: "email",
    OIDC_EMAIL_VERIFIED_CLAIM: "email_verified",
    OIDC_AUTHORIZATION_ENDPOINT:
      "https://identity.example.test/oauth2/v2.0/authorize",
    OIDC_TOKEN_ENDPOINT: "https://identity.example.test/oauth2/v2.0/token",
    OIDC_CLIENT_ID: "project42-browser",
    OIDC_REDIRECT_URI: "https://api.example.test/v1/auth/callback",
    SESSION_ENCRYPTION_KEY:
      "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
    BOOTSTRAP_OWNER_ISSUER: "",
    BOOTSTRAP_OWNER_SUBJECT: "",
  };

  let currentTransaction = null;
  const repository = {
    ensureInstallation: async () => undefined,
    createOidcAuthorizationTransaction: async (input) => {
      currentTransaction = { ...input, consumed: false };
    },
    consumeOidcAuthorizationTransaction: async (input) => {
      assert.ok(currentTransaction);
      assert.equal(input.transactionId, currentTransaction.transaction.id);
      assert.equal(currentTransaction.consumed, false);
      currentTransaction.consumed = true;
    },
  };

  let expectedNonce = "";
  let expiredToken = "";
  const browserAdapter = new BrowserOidcAdapter(env, async () =>
    Response.json({ id_token: expiredToken }),
  );
  const verifier = new OidcJwtVerifier(env);
  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...values) => logged.push(values.join(" "));
  t.after(() => {
    console.error = originalConsoleError;
  });
  const api = (request) => {
    const headers = new Headers(request.headers);
    headers.set("CF-Connecting-IP", "192.0.2.42");
    return handleRequest(
      new Request(request, { headers }),
      env,
      verifier,
      repository,
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
        encodeURIComponent("https://learn.example.test/account/"),
    ),
  );
  assert.equal(start.status, 302, await start.clone().text());
  const authorization = new URL(start.headers.get("location"));
  const state = authorization.searchParams.get("state");
  expectedNonce = authorization.searchParams.get("nonce");
  assert.ok(state);
  assert.ok(expectedNonce);
  const transactionCookie = cookiePair(
    setCookies(start),
    "__Host-project42_oidc",
  );

  const now = Math.floor(Date.now() / 1_000);
  expiredToken = await new SignJWT({
    nonce: expectedNonce,
    auth_time: now - 120,
    email: "must-not-appear@example.test",
    name: "Must Not Appear",
  })
    .setProtectedHeader({ alg: "RS256", kid: "expiry-test-key" })
    .setIssuer(issuer)
    .setSubject("must-not-appear")
    .setAudience(env.OIDC_CLIENT_ID)
    .setIssuedAt(now - 120)
    .setExpirationTime(now - 60)
    .sign(privateKey);

  const callback = await api(
    new Request(
      `https://api.example.test/v1/auth/callback?code=opaque-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: transactionCookie } },
    ),
  );
  assert.equal(callback.status, 302);
  assert.equal(
    callback.headers.get("location"),
    "https://learn.example.test/account/?auth=error",
  );
  assert.equal(currentTransaction.consumed, true);
  const callbackCookies = setCookies(callback);
  assert.ok(
    callbackCookies.some(
      (value) =>
        value.startsWith("__Host-project42_oidc=") &&
        value.includes("Max-Age=0"),
    ),
  );
  assert.equal(
    callbackCookies.some((value) =>
      value.startsWith("__Host-project42_session="),
    ),
    false,
  );

  assert.equal(logged.length, 1);
  const diagnostic = JSON.parse(logged[0]);
  assert.deepEqual(
    {
      level: diagnostic.level,
      method: diagnostic.method,
      path: diagnostic.path,
      status: diagnostic.status,
      code: diagnostic.code,
      action: diagnostic.action,
      recovery: diagnostic.recovery,
      category: diagnostic.identityTokenDiagnostic?.category,
      joseCode: diagnostic.identityTokenDiagnostic?.joseCode,
      claim: diagnostic.identityTokenDiagnostic?.claim,
    },
    {
      level: "warn",
      method: "GET",
      path: "/v1/auth/callback",
      status: 302,
      code: "invalid_identity_token",
      action: "oidc.callback.restart",
      recovery: "restart_sign_in",
      category: "jose_validation",
      joseCode: "ERR_JWT_EXPIRED",
      claim: "exp",
    },
  );
  const serializedLog = logged.join("\n");
  for (const forbidden of [
    expiredToken,
    expectedNonce,
    "opaque-code",
    "must-not-appear",
    "must-not-appear@example.test",
    issuer,
  ]) {
    assert.equal(serializedLog.includes(forbidden), false);
  }

  const restart = await api(
    new Request(
      "https://api.example.test/v1/auth/start?return_to=" +
        encodeURIComponent("https://learn.example.test/account/"),
    ),
  );
  assert.equal(restart.status, 302);
  assert.notEqual(
    new URL(restart.headers.get("location")).searchParams.get("state"),
    state,
  );
  assert.ok(
    setCookies(restart).some((value) =>
      value.startsWith("__Host-project42_oidc="),
    ),
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { BrowserOidcAdapter } from "../dist/worker.js";

const sensitive = {
  authorizationCode: "authorization-code-that-must-not-be-logged",
  clientSecret: "client-secret-that-must-not-be-logged",
  providerBody: "provider-body-that-must-not-be-logged",
  tokenEndpoint: "https://identity.example.test/oauth2/v2.0/token",
};

const environment = {
  OIDC_AUTHORIZATION_ENDPOINT:
    "https://identity.example.test/oauth2/v2.0/authorize",
  OIDC_TOKEN_ENDPOINT: sensitive.tokenEndpoint,
  OIDC_CLIENT_ID: "project42-browser",
  OIDC_CLIENT_SECRET: sensitive.clientSecret,
  OIDC_REDIRECT_URI: "https://api.example.test/v1/auth/callback",
  SESSION_ENCRYPTION_KEY:
    "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
};

const transaction = {
  id: "transaction-id",
  state: "state",
  nonce: "nonce",
  codeVerifier: "code-verifier",
  returnTo: "https://learn.example.test/account/",
  expiresAt: "2026-07-29T17:00:00.000Z",
};

function assertUnavailable(error) {
  assert.equal(error.status, 502);
  assert.equal(error.code, "identity_provider_unavailable");
  assert.equal(error.message, "Sign-in could not be completed. Try again.");
  return true;
}

async function captureErrors(action) {
  const output = [];
  const original = console.error;
  console.error = (...values) => output.push(values.join(" "));
  try {
    await action();
  } finally {
    console.error = original;
  }
  return output;
}

function assertPrivacySafe(output, expectedReason) {
  assert.equal(output.length, 1);
  const event = JSON.parse(output[0]);
  assert.deepEqual(event, {
    level: "error",
    requestId: "request-id",
    action: "oidc.token.exchange",
    code: "identity_provider_transport_failed",
    reason: expectedReason,
  });
  for (const value of Object.values(sensitive)) {
    assert.doesNotMatch(output[0], new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

test("OIDC token exchange uses bounded manual redirect handling", async () => {
  let observed;
  const adapter = new BrowserOidcAdapter(environment, async (url, init) => {
    observed = { url, init };
    return Response.json({ id_token: "verified-id-token" });
  });

  const result = await adapter.exchange(
    sensitive.authorizationCode,
    transaction,
    "request-id",
  );

  assert.deepEqual(result, {
    idToken: "verified-id-token",
    clientId: environment.OIDC_CLIENT_ID,
  });
  assert.equal(observed.url, sensitive.tokenEndpoint);
  assert.equal(observed.init.redirect, "manual");
  assert.ok(observed.init.signal instanceof AbortSignal);
  const body = new URLSearchParams(observed.init.body);
  assert.equal(body.get("code"), sensitive.authorizationCode);
  assert.equal(body.get("client_secret"), sensitive.clientSecret);
  assert.equal(body.get("code_verifier"), transaction.codeVerifier);
});

test("OIDC token exchange rejects redirects without forwarding credentials", async () => {
  let calls = 0;
  const adapter = new BrowserOidcAdapter(environment, async () => {
    calls += 1;
    return new Response(null, {
      status: 307,
      headers: { location: "https://redirect.example.test/token" },
    });
  });

  const output = await captureErrors(async () => {
    await assert.rejects(
      adapter.exchange(
        sensitive.authorizationCode,
        transaction,
        "request-id",
      ),
      assertUnavailable,
    );
  });

  assert.equal(calls, 1);
  assertPrivacySafe(output, "redirect");
});

test("OIDC token exchange reports privacy-safe network diagnostics", async () => {
  const adapter = new BrowserOidcAdapter(environment, async () => {
    throw new TypeError(
      `${sensitive.providerBody}: ${sensitive.authorizationCode}`,
    );
  });

  const output = await captureErrors(async () => {
    await assert.rejects(
      adapter.exchange(
        sensitive.authorizationCode,
        transaction,
        "request-id",
      ),
      assertUnavailable,
    );
  });

  assertPrivacySafe(output, "network");
});

test("OIDC token exchange reports privacy-safe timeout diagnostics", async () => {
  const adapter = new BrowserOidcAdapter(environment, async () => {
    throw new DOMException(sensitive.providerBody, "TimeoutError");
  });

  const output = await captureErrors(async () => {
    await assert.rejects(
      adapter.exchange(
        sensitive.authorizationCode,
        transaction,
        "request-id",
      ),
      assertUnavailable,
    );
  });

  assertPrivacySafe(output, "timeout");
});

test("OIDC provider rejections remain sanitized", async () => {
  const adapter = new BrowserOidcAdapter(environment, async () =>
    Response.json(
      {
        error: "invalid_grant",
        error_description: sensitive.providerBody,
      },
      { status: 400 },
    ),
  );

  await assert.rejects(
    adapter.exchange(
      sensitive.authorizationCode,
      transaction,
      "request-id",
    ),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, "authorization_code_rejected");
      assert.equal(
        error.message,
        "Sign-in could not be completed. Start sign-in again.",
      );
      assert.doesNotMatch(error.message, new RegExp(sensitive.providerBody));
      return true;
    },
  );
});

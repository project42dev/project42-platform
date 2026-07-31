import assert from "node:assert/strict";
import test from "node:test";
import { GithubIdentityLinkAdapter } from "../dist/worker.js";

const environment = {
  ALLOWED_ORIGINS: "https://learn.example.test",
  GITHUB_LINK_CLIENT_ID: "Iv1.1234567890abcdef",
  GITHUB_LINK_CLIENT_SECRET: "s".repeat(40),
  GITHUB_LINK_REDIRECT_URI:
    "https://learn.example.test/account/github/callback/",
};

const link = {
  id: "00000000-0000-4000-8000-000000000001",
  provider: "github",
  state: "state-value",
  codeChallenge: "A".repeat(43),
  codeChallengeMethod: "S256",
  returnPath: "/account",
  expiresAt: "2026-07-28T03:00:00.000Z",
};

test("GitHub authorization URL is exact, PKCE-bound, and scope-free", () => {
  const adapter = new GithubIdentityLinkAdapter(environment);
  const authorization = new URL(adapter.createAuthorizationUrl(link));
  assert.equal(authorization.origin, "https://github.com");
  assert.equal(authorization.pathname, "/login/oauth/authorize");
  assert.equal(
    authorization.searchParams.get("client_id"),
    environment.GITHUB_LINK_CLIENT_ID,
  );
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    environment.GITHUB_LINK_REDIRECT_URI,
  );
  assert.equal(authorization.searchParams.get("state"), link.state);
  assert.equal(
    authorization.searchParams.get("code_challenge"),
    link.codeChallenge,
  );
  assert.equal(
    authorization.searchParams.get("code_challenge_method"),
    "S256",
  );
  assert.equal(authorization.searchParams.has("scope"), false);
});

test("GitHub provider failures are bounded and never return token details", async () => {
  const unavailable = new GithubIdentityLinkAdapter(environment, async () => {
    throw new Error("network detail that must not escape");
  });
  await assert.rejects(
    () =>
      unavailable.verify({
        code: "temporary-code",
        codeVerifier: "v".repeat(43),
      }),
    (error) =>
      error?.code === "github_provider_unavailable" &&
      !error.message.includes("network detail"),
  );

  const rejected = new GithubIdentityLinkAdapter(environment, async () =>
    Response.json(
      {
        error: "bad_verification_code",
        error_description: "sensitive provider detail",
      },
      { status: 401 },
    ),
  );
  await assert.rejects(
    () =>
      rejected.verify({
        code: "temporary-code",
        codeVerifier: "v".repeat(43),
      }),
    (error) =>
      error?.code === "github_authorization_failed" &&
      !error.message.includes("sensitive provider detail"),
  );
});

test("GitHub provider fetches use the runtime function without a receiver", async () => {
  let calls = 0;
  const adapter = new GithubIdentityLinkAdapter(
    environment,
    async function (url, init) {
      assert.equal(this, undefined);
      calls += 1;
      if (calls === 1) {
        assert.equal(url, "https://github.com/login/oauth/access_token");
        assert.equal(init.redirect, "error");
        assert.ok(init.signal instanceof AbortSignal);
        return Response.json({
          access_token: "provider-token",
          token_type: "bearer",
        });
      }
      assert.equal(url, "https://api.github.com/user");
      assert.equal(init.headers.authorization, "Bearer provider-token");
      assert.ok(init.signal instanceof AbortSignal);
      return Response.json({
        id: 42,
        login: "contributor",
        name: "Project Contributor",
      });
    },
  );

  const identity = await adapter.verify({
    code: "temporary-code",
    codeVerifier: "v".repeat(43),
  });

  assert.equal(calls, 2);
  assert.equal(identity.subject, "42");
  assert.equal(identity.providerLogin, "contributor");
});

async function captureWarnings(action) {
  const output = [];
  const original = console.warn;
  console.warn = (...values) => output.push(values.join(" "));
  try {
    await action();
  } finally {
    console.warn = original;
  }
  return output;
}

test("GitHub provider timeout is bounded, classified, and never logs provider detail (AB#6485)", async () => {
  const sensitiveDetail = "provider-detail-that-must-not-be-logged";
  const adapter = new GithubIdentityLinkAdapter(environment, async (_url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    throw new DOMException(sensitiveDetail, "AbortError");
  });

  const output = await captureWarnings(async () => {
    await assert.rejects(
      adapter.verify({
        code: "temporary-code",
        codeVerifier: "v".repeat(43),
        requestId: "request-id",
      }),
      (error) =>
        error?.code === "github_provider_unavailable" &&
        !error.message.includes(sensitiveDetail),
    );
  });

  assert.equal(output.length, 1);
  const event = JSON.parse(output[0]);
  assert.deepEqual(event, {
    level: "warn",
    requestId: "request-id",
    action: "github.identity_link.provider_failure",
    step: "token_exchange",
    reason: "timeout",
    errorType: "AbortError",
  });
  assert.doesNotMatch(output[0], new RegExp(sensitiveDetail));
});

test("GitHub provider network failures are classified and never log provider detail", async () => {
  const sensitiveDetail = "network-detail-that-must-not-be-logged";
  const adapter = new GithubIdentityLinkAdapter(environment, async () => {
    throw new TypeError(sensitiveDetail);
  });

  const output = await captureWarnings(async () => {
    await assert.rejects(
      adapter.verify({
        code: "temporary-code",
        codeVerifier: "v".repeat(43),
        requestId: "request-id",
      }),
      (error) => error?.code === "github_provider_unavailable",
    );
  });

  assert.equal(output.length, 1);
  const event = JSON.parse(output[0]);
  assert.equal(event.reason, "network");
  assert.doesNotMatch(output[0], new RegExp(sensitiveDetail));
});

test("GitHub linkage fails closed on missing or cross-origin configuration", () => {
  assert.throws(
    () => new GithubIdentityLinkAdapter({ ALLOWED_ORIGINS: "" }).createAuthorizationUrl(link),
    (error) => error?.code === "github_link_not_configured",
  );
  assert.throws(
    () =>
      new GithubIdentityLinkAdapter({
        ...environment,
        GITHUB_LINK_REDIRECT_URI:
          "https://attacker.example.test/account/github/callback/",
      }).createAuthorizationUrl(link),
    (error) => error?.code === "github_link_not_configured",
  );
});

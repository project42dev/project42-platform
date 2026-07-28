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

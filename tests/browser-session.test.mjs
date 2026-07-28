import assert from "node:assert/strict";
import test from "node:test";
import {
  BROWSER_SESSION_COOKIE,
  clearHostCookie,
  createHostCookie,
  createPkceChallenge,
  normalizeReturnTarget,
  OIDC_TRANSACTION_COOKIE,
  openOidcTransaction,
  randomBase64Url,
  readBrowserOidcConfiguration,
  readCookie,
  sealOidcTransaction,
  sha256Base64Url,
} from "../dist/index.js";

const key = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";

test("OIDC transaction state, nonce, PKCE, and encrypted cookie are bound", async () => {
  const configuration = await readBrowserOidcConfiguration({
    OIDC_AUTHORIZATION_ENDPOINT: "https://identity.example.test/authorize",
    OIDC_TOKEN_ENDPOINT: "https://identity.example.test/token",
    OIDC_CLIENT_ID: "project42-browser",
    OIDC_REDIRECT_URI: "https://api.example.test/v1/auth/callback",
    SESSION_ENCRYPTION_KEY: key,
  });
  const state = randomBase64Url();
  const nonce = randomBase64Url();
  const codeVerifier = randomBase64Url(48);
  const challenge = await createPkceChallenge(codeVerifier);
  const sealed = await sealOidcTransaction(
    {
      id: crypto.randomUUID(),
      state,
      nonce,
      codeVerifier,
      returnTo: "https://learn.example.test/account/",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    configuration.encryptionKey,
  );
  const opened = await openOidcTransaction(
    sealed,
    configuration.encryptionKey,
  );

  assert.equal(opened.state, state);
  assert.equal(opened.nonce, nonce);
  assert.equal(opened.codeVerifier, codeVerifier);
  assert.equal(challenge, await sha256Base64Url(codeVerifier));
  assert.equal(sealed.includes(state), false);
  assert.equal(sealed.includes(codeVerifier), false);
  await assert.rejects(
    () =>
      openOidcTransaction(
        `${sealed.slice(0, -1)}${sealed.endsWith("A") ? "B" : "A"}`,
        configuration.encryptionKey,
      ),
    /invalid or expired/,
  );
});

test("host cookies are HttpOnly and return targets stay on allowed origins", () => {
  const sessionCookie = createHostCookie(
    BROWSER_SESSION_COOKIE,
    "opaque-session",
    3600,
  );
  assert.match(sessionCookie, /^__Host-project42_session=/);
  assert.match(sessionCookie, /Path=\//);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.doesNotMatch(sessionCookie, /Domain=/);
  assert.match(clearHostCookie(OIDC_TRANSACTION_COOKIE), /Max-Age=0/);
  assert.equal(
    readCookie(
      new Request("https://api.example.test", {
        headers: { cookie: `other=x; ${sessionCookie.split(";")[0]}` },
      }),
      BROWSER_SESSION_COOKIE,
    ),
    "opaque-session",
  );

  assert.equal(
    normalizeReturnTarget(
      "https://learn.example.test/profile/?tab=identity",
      "https://learn.example.test,https://admin.example.test",
    ),
    "https://learn.example.test/profile/?tab=identity",
  );
  assert.equal(
    normalizeReturnTarget(
      "https://attacker.example/profile/",
      "https://learn.example.test",
    ),
    "https://learn.example.test/account/",
  );
});

test("browser OIDC configuration fails closed on unsafe endpoints and key size", async () => {
  await assert.rejects(
    () =>
      readBrowserOidcConfiguration({
        OIDC_AUTHORIZATION_ENDPOINT: "http://identity.example.test/authorize",
        OIDC_TOKEN_ENDPOINT: "https://identity.example.test/token",
        OIDC_CLIENT_ID: "project42-browser",
        OIDC_REDIRECT_URI: "https://api.example.test/v1/auth/callback",
        SESSION_ENCRYPTION_KEY: key,
      }),
    /HTTPS URL/,
  );
  await assert.rejects(
    () =>
      readBrowserOidcConfiguration({
        OIDC_AUTHORIZATION_ENDPOINT: "https://identity.example.test/authorize",
        OIDC_TOKEN_ENDPOINT: "https://identity.example.test/token",
        OIDC_CLIENT_ID: "project42-browser",
        OIDC_REDIRECT_URI: "https://api.example.test/v1/auth/callback",
        SESSION_ENCRYPTION_KEY: "c2hvcnQ",
      }),
    /32-byte key/,
  );
});

// Hosted identity-provider conformance leg for AB#5418.
//
// The reference self-host provider (Keycloak) is covered by
// scripts/smoke-keycloak-browser-session.mjs and
// scripts/smoke-secure-browser-session.mjs. This script is the matching leg for
// the hosted test provider: it drives a real browser through the same
// Authorization Code + PKCE flow against a deployed Project 42 API and a real
// hosted issuer, and asserts the same session guarantees.
//
// It is deliberately provider-neutral. Every provider-specific detail (issuer,
// sign-in form selectors, the optional "stay signed in" interstitial) is read
// from configuration rather than hardcoded, so the same conformance leg can be
// pointed at any hosted OIDC provider without editing this file.
//
// This script never provisions or deletes an identity. The hosted test identity
// is expected to already exist; that keeps the credential this script needs down
// to a single sign-in-capable test user with no administrative rights.

import assert from "node:assert/strict";
import { chromium } from "playwright";

const learnOrigin = trimTrailingSlash(required("PROJECT42_HOSTED_LEARN_ORIGIN"));
const apiOrigin = trimTrailingSlash(required("PROJECT42_HOSTED_API_ORIGIN"));
const issuer = trimTrailingSlash(required("PROJECT42_HOSTED_ISSUER"));
const email = required("PROJECT42_HOSTED_SMOKE_EMAIL");
const password = required("PROJECT42_HOSTED_SMOKE_PASSWORD");
const expectedSubject = process.env.PROJECT42_HOSTED_SMOKE_SUBJECT?.trim();

// Provider sign-in form selectors. The defaults match a Microsoft Entra
// External ID sign-in page; override them for any other hosted provider.
const usernameSelector =
  process.env.PROJECT42_HOSTED_USERNAME_SELECTOR?.trim() ||
  'input[type="email"], input[name="loginfmt"], #username';
const passwordSelector =
  process.env.PROJECT42_HOSTED_PASSWORD_SELECTOR?.trim() ||
  'input[type="password"], input[name="passwd"], #password';
const submitSelector =
  process.env.PROJECT42_HOSTED_SUBMIT_SELECTOR?.trim() ||
  'input[type="submit"], button[type="submit"], #idSIButton9, #kc-login';

const issuerHost = new URL(issuer).host;

let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const authorizationRequests = [];
  const callbackResponses = [];
  const sessionResponses = [];

  page.on("request", (request) => {
    if (!request.isNavigationRequest()) return;
    const url = new URL(request.url());
    // The authorization request is the first navigation that leaves our own
    // origins for the configured hosted issuer.
    if (url.host === issuerHost && url.searchParams.has("client_id")) {
      authorizationRequests.push(url);
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== apiOrigin) return;
    if (url.pathname === "/v1/auth/callback") {
      callbackResponses.push(response.status());
    }
    if (url.pathname === "/v1/auth/session") {
      sessionResponses.push(response.status());
    }
  });

  await page.goto(`${learnOrigin}/account/`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Continue to sign in or request access" })
    .click();

  await page.waitForURL(`**${issuerHost}/**`);

  // --- Assert the request that left our origin is a real PKCE code flow. ---
  assert.ok(
    authorizationRequests.length > 0,
    "The browser never issued an authorization request to the hosted issuer.",
  );
  const authorization = authorizationRequests[0];
  assert.equal(
    authorization.host,
    issuerHost,
    "The authorization request did not go to the configured hosted issuer.",
  );
  assert.equal(
    authorization.searchParams.get("response_type"),
    "code",
    "The hosted flow must use the authorization code response type.",
  );
  assert.equal(
    authorization.searchParams.get("code_challenge_method"),
    "S256",
    "The hosted flow must use S256 PKCE, not plain.",
  );
  const codeChallenge = authorization.searchParams.get("code_challenge");
  assert.ok(
    typeof codeChallenge === "string" && codeChallenge.length >= 43,
    "The hosted authorization request carried no usable PKCE code challenge.",
  );
  for (const parameter of ["state", "nonce"]) {
    const value = authorization.searchParams.get(parameter);
    assert.ok(
      typeof value === "string" && value.length > 0,
      `The hosted authorization request carried no ${parameter}.`,
    );
  }
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    `${apiOrigin}/v1/auth/callback`,
    "The hosted authorization request pointed at an unexpected redirect URI.",
  );

  // --- Complete sign-in on the hosted provider's own pages. ---
  await page.locator(usernameSelector).first().fill(email);
  await page.locator(submitSelector).first().click();
  await page.locator(passwordSelector).first().waitFor({ state: "visible" });
  await page.locator(passwordSelector).first().fill(password);
  await Promise.all([
    page.waitForURL(`${learnOrigin}/account/**`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    }),
    page.locator(submitSelector).first().click(),
  ]);

  assert.ok(
    callbackResponses.some((status) => status === 302),
    "The browser did not complete the API callback redirect.",
  );
  assert.ok(
    sessionResponses.some((status) => status === 200),
    "Learn did not load an authenticated API session.",
  );

  // --- Assert the browser session cookie's security properties. ---
  const cookies = await context.cookies(apiOrigin);
  const sessionCookie = cookies.find(
    (cookie) => cookie.name === "__Secure-project42_session",
  );
  assert.ok(sessionCookie, "The API session cookie was not stored.");
  assert.equal(sessionCookie.secure, true);
  assert.equal(sessionCookie.httpOnly, true);
  assert.equal(sessionCookie.sameSite, "Lax");
  assert.equal(sessionCookie.path, "/");
  assert.equal(
    cookies.some((cookie) => cookie.name === "__Host-project42_oidc"),
    false,
    "The one-time OIDC transaction cookie remained after callback.",
  );

  // --- Assert the session resolves to the hosted issuer's identity. ---
  const session = await readSession(page);
  assert.equal(session.status, 200);
  assert.equal(
    session.body.account.identity.issuer,
    issuer,
    "The session was not resolved against the configured hosted issuer.",
  );
  assert.equal(typeof session.body.account.identity.subject, "string");
  if (expectedSubject) {
    assert.equal(session.body.account.identity.subject, expectedSubject);
  }
  assert.equal(session.body.account.primaryEmail, email);
  assert.equal(typeof session.body.session.expiresAt, "string");

  // --- Sign out and assert the session is genuinely invalidated. ---
  await page.getByRole("button", { name: "Sign out on this browser" }).click();
  await page
    .getByRole("button", { name: "Continue to sign in or request access" })
    .waitFor();
  assert.equal(
    (await context.cookies(apiOrigin)).some(
      (cookie) => cookie.name === "__Secure-project42_session",
    ),
    false,
    "The browser retained the session cookie after sign-out.",
  );
  const afterSignOut = await readSession(page);
  assert.equal(
    afterSignOut.status,
    401,
    "The API still served an authenticated session after sign-out.",
  );

  console.log(
    "Verified hosted-provider Authorization Code + PKCE (S256) sign-in, " +
      "single-use OIDC transaction cookie, secure browser session cookie, " +
      "issuer-and-subject identity resolution, and sign-out invalidation.",
  );
} finally {
  await browser?.close();
}

async function readSession(page) {
  return page.evaluate(async (origin) => {
    const response = await fetch(`${origin}/v1/auth/session`, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    return {
      status: response.status,
      body: response.status === 200 ? await response.json() : null,
    };
  }, apiOrigin);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

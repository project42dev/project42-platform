// Hosted identity-provider conformance leg for AB#5418, and the learner-progress
// persistence gate for T-02.
//
// The reference self-host provider (Keycloak) is covered by
// scripts/smoke-keycloak-browser-session.mjs and
// scripts/smoke-secure-browser-session.mjs. This script is the matching leg for
// the hosted test provider: it drives a real browser through the same
// Authorization Code + PKCE flow against a deployed Project 42 API and a real
// hosted issuer, and asserts the same session guarantees.
//
// Signing in is not the product. Until T-02 this script proved only the OIDC
// redirect chain, which is exactly how a learner could sign in, complete a
// module, and have nothing reach D1 while every check stayed green. It now also
// records one module completion through the account API the front end uses,
// reads it back from a second, independently signed-in browser session --
// both from GET /v1/me/progress and from the module_progress rows in
// GET /v1/me/export -- and then removes it again so the gate is repeatable.
// The assertion logic lives in scripts/lib/hosted-progress-persistence.mjs,
// where tests/hosted-progress-persistence-gate.test.mjs proves it fails on a
// 500, on a 200 without the completion, and on a response of the wrong shape.
//
// It is deliberately provider-neutral. Every provider-specific detail (issuer,
// sign-in form selectors, the optional "stay signed in" interstitial) is read
// from configuration rather than hardcoded, so the same conformance leg can be
// pointed at any hosted OIDC provider without editing this file.
//
// This script never provisions or deletes an identity. The hosted test identity
// is expected to already exist and to be approved; that keeps the credential
// this script needs down to a single sign-in-capable test user with no
// administrative rights. The only learner data it writes is the test module's
// progress on that one account, and it removes that before it exits.

import assert from "node:assert/strict";
import { chromium } from "playwright";
import { runProgressPersistenceGate } from "./lib/hosted-progress-persistence.mjs";

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
  'input[type="email"], input[name="loginfmt"], input[name="username"], #username';
const passwordSelector =
  process.env.PROJECT42_HOSTED_PASSWORD_SELECTOR?.trim() ||
  'input[type="password"], input[name="passwd"], #password';
const submitSelector =
  process.env.PROJECT42_HOSTED_SUBMIT_SELECTOR?.trim() ||
  'input[type="submit"], button[type="submit"], #idSIButton9, #kc-login';
// Optional: a provider that interposes a "stay signed in?" page after the
// password. When set, the control it names is clicked if that page appears.
const staySignedInSelector =
  process.env.PROJECT42_HOSTED_STAY_SIGNED_IN_SELECTOR?.trim() || "";

const issuerHost = new URL(issuer).host;
const runId = gateRunId();

let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });

  // --- Session one: sign in and assert the session guarantees. ---
  const primary = await signInAndVerify(browser, "primary");

  // --- Persistence: write one completion, read it from a fresh session. ---
  const fresh = [];
  const gate = await runProgressPersistenceGate({
    primary: browserApiClient(primary.page),
    openFreshSession: async () => {
      // A new browser context carries no cookie from session one, so this is a
      // second full sign-in through the hosted issuer, not a reused session.
      const session = await signInAndVerify(browser, "fresh");
      fresh.push(session);
      return browserApiClient(session.page);
    },
    runId,
    log: (message) => console.log(message),
  });
  for (const session of fresh) await session.context.close();

  // --- Sign out and assert the session is genuinely invalidated. ---
  await primary.page.goto(`${learnOrigin}/account/`, {
    waitUntil: "domcontentloaded",
  });
  await primary.page
    .getByRole("button", { name: "Sign out on this browser" })
    .click();
  await signedOutEntry(primary.page).waitFor();
  assert.equal(
    (await primary.context.cookies(apiOrigin)).some(
      (cookie) => cookie.name === "__Secure-project42_session",
    ),
    false,
    "The browser retained the session cookie after sign-out.",
  );
  const afterSignOut = await readSession(primary.page);
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
  console.log(
    `Verified learner-progress persistence: completed ${gate.moduleId} ` +
      `(attempt ${gate.attemptId}) through PUT /v1/me/progress, read it back ` +
      `from a fresh signed-in session at revision ${gate.freshSessionRevision}, ` +
      "found its module_progress row in the account export, and removed it " +
      `again (revision ${gate.revisionAfterCleanup}` +
      `${gate.preCleaned ? "; residue from an earlier run was cleaned first" : ""}).`,
  );
} finally {
  await browser?.close();
}

async function signInAndVerify(browser, label) {
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
  await signedOutEntry(page).click();

  await page.waitForURL(`**${issuerHost}/**`);

  // --- Assert the request that left our origin is a real PKCE code flow. ---
  assert.ok(
    authorizationRequests.length > 0,
    `[${label}] The browser never issued an authorization request to the hosted issuer.`,
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
  const landed = page.waitForURL(
    (url) =>
      url.origin === learnOrigin &&
      url.pathname.replace(/\/+$/, "") === "/account",
    { waitUntil: "domcontentloaded", timeout: 120_000 },
  );
  await page.locator(submitSelector).first().click();
  if (staySignedInSelector) {
    const prompt = page.locator(staySignedInSelector).first();
    const outcome = await Promise.race([
      landed.then(() => "landed"),
      prompt.waitFor({ state: "visible", timeout: 120_000 }).then(() => "prompt"),
    ]);
    if (outcome === "prompt") await prompt.click();
  }
  await landed;

  assert.ok(
    callbackResponses.some((status) => status === 302),
    `[${label}] The browser did not complete the API callback redirect.`,
  );
  // The account page reads the session as it loads; give it the chance.
  if (!sessionResponses.includes(200)) {
    await page
      .waitForResponse(
        (response) =>
          response.url().startsWith(`${apiOrigin}/v1/auth/session`) &&
          response.status() === 200,
        { timeout: 30_000 },
      )
      .catch(() => undefined);
  }
  assert.ok(
    sessionResponses.some((status) => status === 200),
    `[${label}] Learn did not load an authenticated API session.`,
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
  // Progress routes refuse any account that is not approved (403). Say so
  // plainly rather than letting the persistence gate report a bare 403.
  assert.equal(
    session.body.account.state,
    "approved",
    `[${label}] The hosted smoke account is "${session.body.account.state}", ` +
      "not approved, so it cannot write learner progress. Approve it in the " +
      "admin console before this gate can run.",
  );

  // Leave the React application before the gate talks to the API, so nothing
  // but the gate writes progress during the run. The document stays on the
  // Learn origin, so every request carries the same Origin and session cookie
  // the front end's own requests carry.
  await page.goto(`${learnOrigin}/robots.txt`, { waitUntil: "domcontentloaded" });

  return { context, page };
}

function signedOutEntry(page) {
  // The signed-out account page's own sign-in control. Scoped to <main> so the
  // profile menu's "Sign in" item cannot satisfy it.
  return page.locator("main").getByRole("button", { name: "Sign in", exact: true });
}

function browserApiClient(page) {
  return ({ method, path, body }) =>
    page.evaluate(
      async ({ origin, method, path, body }) => {
        const init = {
          method,
          credentials: "include",
          headers: { accept: "application/json" },
        };
        if (body !== undefined) {
          init.body = JSON.stringify(body);
          init.headers["content-type"] = "application/json";
        }
        const response = await fetch(`${origin}${path}`, init);
        return { status: response.status, text: await response.text() };
      },
      { origin: apiOrigin, method, path, body },
    );
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

function gateRunId() {
  const runIdentifier = process.env.GITHUB_RUN_ID?.trim();
  if (runIdentifier && /^\d+$/.test(runIdentifier)) {
    const attempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "1";
    return `gh-${runIdentifier}-${attempt}`.toLowerCase();
  }
  return `local-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

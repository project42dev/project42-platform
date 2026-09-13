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
import path from "node:path";
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

// The sandbox stays ON by default: this browser types a real password into a
// real identity provider, so an operator running the smoke from a workstation
// gets the protection without having to ask for it. Hosted runners are the
// exception -- current GitHub ubuntu images refuse unprivileged user
// namespaces, so Chromium cannot build its sandbox and the launch dies with
// "Target page, context or browser has been closed", a message that says
// nothing about the cause. Opting out is therefore explicit, per-environment,
// and named, rather than a default that quietly runs unsandboxed everywhere.
const chromiumSandbox =
  (process.env.PROJECT42_HOSTED_CHROMIUM_SANDBOX?.trim() || "on") !== "off";

// Where a failing run leaves its screenshots. This gate drives a browser on a
// machine nobody is watching, so when it fails the only thing left is a
// Playwright timeout that names a selector or a URL pattern and says nothing
// about what the page actually was. Capturing the page at the moment of
// failure turns one CI run into a diagnosis instead of the start of a guessing
// loop.
const diagnosticDirectory =
  process.env.PROJECT42_HOSTED_DIAGNOSTIC_DIR?.trim() || "smoke-diagnostics";

// The origin the browser is expected to reach to sign in.
//
// This is NOT the issuer, and assuming it was is what made this gate
// unrunnable. OIDC never promises that a provider's authorization endpoint
// lives on its issuer's host -- discovery exists precisely because it may not
// -- and Microsoft Entra External ID is a provider where it does not. This
// tenant's own discovery document states
//   issuer:                https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0
//   authorization_endpoint https://<tenant-name>.ciamlogin.com/<tenant-id>/...
// from BOTH of its login hosts: one authority, two hosts, and the `iss` the
// tokens carry is the tenant-id form whichever host signed the reader in.
//
// So the issuer is asserted where it is actually observable and actually
// meaningful -- on the resolved session's identity below, which is the `iss`
// claim the API verified -- and this names only the front door. It defaults to
// the issuer's origin, so every provider that does co-locate the two
// (Keycloak, and the self-host reference) needs no configuration and behaves
// exactly as before.
const authorizationOrigin = new URL(
  process.env.PROJECT42_HOSTED_AUTHORIZATION_ORIGIN?.trim() || issuer,
).origin;
const runId = gateRunId();

// Every page this run opens, so a failure anywhere -- sign-in, the persistence
// gate, sign-out -- can be described rather than merely reported.
const openedPages = [];

let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox });

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
} catch (failure) {
  await describeFailure(failure);
  throw failure;
} finally {
  await browser?.close();
}

/**
 * Print what each still-open page actually was when the run failed, and save a
 * screenshot of it.
 *
 * Nothing here may leak the smoke identity's password:
 *  - the URL is printed as origin + pathname with only the NAMES of its query
 *    parameters, because a failure on the OIDC callback sits on a URL carrying
 *    a live authorization `code`;
 *  - the DOM excerpt is `innerText`, which is rendered text and therefore
 *    cannot contain an `<input>`'s value, rather than `innerHTML`, which can;
 *  - password fields are emptied before the screenshot, so not even a masked
 *    field of the right length is photographed.
 */
async function describeFailure(failure) {
  console.error("--- hosted smoke failure diagnostics ---");
  console.error(`${failure?.name ?? "Error"}: ${failure?.message ?? failure}`);
  for (const { label, page } of openedPages) {
    if (page.isClosed()) continue;
    try {
      const url = new URL(page.url());
      const parameters = [...new Set(url.searchParams.keys())];
      console.error(`[${label}] url: ${url.origin}${url.pathname}`);
      console.error(
        `[${label}] query parameter names: ${parameters.join(", ") || "(none)"}`,
      );
      console.error(`[${label}] title: ${await page.title()}`);
      const text = await page.evaluate(() => {
        for (const field of document.querySelectorAll("input[type=password]")) {
          field.value = "";
        }
        return document.body?.innerText ?? "";
      });
      console.error(
        `[${label}] visible text (first 1500 characters):\n` +
          `${text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500)}`,
      );
      const file = path.join(diagnosticDirectory, `${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.error(`[${label}] screenshot: ${file}`);
    } catch (caught) {
      console.error(`[${label}] could not be described: ${caught?.message ?? caught}`);
    }
  }
  console.error("--- end hosted smoke failure diagnostics ---");
}

async function signInAndVerify(browser, label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  openedPages.push({ label, page });

  const authorizationRequests = [];
  const callbackResponses = [];
  const sessionResponses = [];

  page.on("request", (request) => {
    if (!request.isNavigationRequest()) return;
    const url = new URL(request.url());
    // The authorization request is the first navigation that leaves our own
    // origins for the provider's authorization origin.
    if (url.origin === authorizationOrigin && url.searchParams.has("client_id")) {
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

  await page.waitForURL(`${authorizationOrigin}/**`);

  // --- Assert the request that left our origin is a real PKCE code flow. ---
  assert.ok(
    authorizationRequests.length > 0,
    `[${label}] The browser never issued an authorization request to ${authorizationOrigin}.`,
  );
  const authorization = authorizationRequests[0];
  assert.equal(
    authorization.origin,
    authorizationOrigin,
    "The authorization request did not go to the configured hosted authorization origin.",
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

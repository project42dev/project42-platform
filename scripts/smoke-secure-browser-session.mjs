import assert from "node:assert/strict";
import { lookup } from "node:dns/promises";
import { chromium } from "playwright";

const learnOrigin = "https://learn.project42.localhost";
const apiOrigin = "https://api.project42.localhost";
const identityOrigin = "https://identity.project42.localhost";
const keycloakAdminOrigin =
  process.env.PROJECT42_KEYCLOAK_ADMIN_ORIGIN ?? "http://identity:8080";
const adminPassword = required("PROJECT42_IDENTITY_ADMIN_PASSWORD");
const subject = required("PROJECT42_BROWSER_SMOKE_SUBJECT");
const email = required("PROJECT42_BROWSER_SMOKE_EMAIL");
const password = required("PROJECT42_BROWSER_SMOKE_PASSWORD");
const gatewayAddress = (await lookup("gateway", { family: 4 })).address;
const hostRules = [
  `MAP learn.project42.localhost ${gatewayAddress}`,
  `MAP api.project42.localhost ${gatewayAddress}`,
  `MAP identity.project42.localhost ${gatewayAddress}`,
].join(",");

let browser;
let userCreated = false;
try {
  await verifyProvisionedUser();
  userCreated = true;

  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: [`--host-resolver-rules=${hostRules}`],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const callbackResponses = [];
  const sessionResponses = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === apiOrigin && url.pathname === "/v1/auth/callback") {
      callbackResponses.push(response.status());
    }
    if (url.origin === apiOrigin && url.pathname === "/v1/auth/session") {
      sessionResponses.push(response.status());
    }
  });

  await page.goto(`${learnOrigin}/account/`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByRole("button", {
      name: "Continue to sign in or request access",
    })
    .click();
  await page.waitForURL(`${identityOrigin}/**`);
  await page.locator("#username").fill(email);
  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL(`${learnOrigin}/account/**`, {
      waitUntil: "domcontentloaded",
    }),
    page.locator("#kc-login").click(),
  ]);

  await page.getByRole("heading", { name: "Secure Compose Owner" }).waitFor();
  await page.getByText(email, { exact: true }).waitFor();
  await page.getByText("approved", { exact: true }).waitFor();

  assert.ok(
    callbackResponses.some((status) => status === 302),
    "The browser did not complete the API callback redirect.",
  );
  assert.ok(
    sessionResponses.some((status) => status === 200),
    "Learn did not load an authenticated API session.",
  );

  const cookies = await context.cookies(apiOrigin);
  const sessionCookie = cookies.find(
    (cookie) => cookie.name === "__Secure-project42_session",
  );
  assert.ok(sessionCookie, "The API session cookie was not stored.");
  assert.equal(sessionCookie.secure, true);
  assert.equal(sessionCookie.httpOnly, true);
  assert.equal(sessionCookie.sameSite, "Lax");
  assert.equal(sessionCookie.path, "/");
  assert.equal(sessionCookie.domain, "api.project42.localhost");
  assert.equal(
    cookies.some((cookie) => cookie.name === "__Host-project42_oidc"),
    false,
    "The one-time OIDC transaction cookie remained after callback.",
  );

  const session = await page.evaluate(async (origin) => {
    const response = await fetch(`${origin}/v1/auth/session`, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    return { status: response.status, body: await response.json() };
  }, apiOrigin);
  assert.equal(session.status, 200);
  assert.equal(session.body.account.identity.subject, subject);
  assert.equal(session.body.account.primaryEmail, email);
  assert.equal(session.body.account.displayName, "Secure Compose Owner");
  assert.equal(session.body.account.state, "approved");
  assert.deepEqual(
    new Set(session.body.account.roles),
    new Set(["learner", "owner"]),
  );
  assert.equal(typeof session.body.session.expiresAt, "string");

  await page
    .getByRole("button", { name: "Sign out on this browser" })
    .click({ force: true });
  await page
    .getByRole("button", {
      name: "Sign in",
    })
    .waitFor();
  assert.equal(
    (await context.cookies(apiOrigin)).some(
      (cookie) => cookie.name === "__Secure-project42_session",
    ),
    false,
    "The browser retained the session cookie after sign-out.",
  );

  console.log(
    "Verified Learn, Keycloak, PKCE callback, secure browser cookie, " +
    "authenticated API session, and sign-out through HTTPS Compose.",
  );
} finally {
  await browser?.close();
  if (userCreated) {
    await adminRequest(
      `/admin/realms/project42/users/${encodeURIComponent(subject)}`,
      { method: "DELETE" },
      [204, 404],
    ).catch(() => undefined);
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function adminAccessToken() {
  const response = await fetch(
    `${keycloakAdminOrigin}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "admin-cli",
        username: "bootstrap-admin",
        password: adminPassword,
        grant_type: "password",
      }),
    },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.access_token, "string");
  return body.access_token;
}

async function adminRequest(path, init, expectedStatuses) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${await adminAccessToken()}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${keycloakAdminOrigin}${path}`, {
    ...init,
    headers,
  });
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `Keycloak administration request returned ${response.status}.`,
    );
  }
  return response;
}

async function verifyProvisionedUser() {
  const response = await adminRequest(
    `/admin/realms/project42/users/${encodeURIComponent(subject)}`,
    { method: "GET" },
    [200],
  );
  const user = await response.json();
  assert.equal(user.id, subject);
  assert.equal(user.email, email);
  assert.equal(user.enabled, true);
  assert.equal(user.emailVerified, true);
}

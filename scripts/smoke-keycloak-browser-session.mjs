import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  BrowserOidcAdapter,
  D1Project42Repository,
  OidcJwtVerifier,
  handleRequest,
} from "../dist/worker.js";
import { createSelfHostAuthAbuseLimiter } from "../dist/self-host/auth-abuse.js";
import { PostgresD1CompatibilityDatabase } from "../dist/self-host/postgres-d1.js";
import { describeLearningRecordAdapter } from "../dist/learning-record-adapter.js";

const keycloakBaseUrl =
  process.env.PROJECT42_KEYCLOAK_BASE_URL ?? "http://identity:8080";
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.PROJECT42_IDENTITY_ADMIN_PASSWORD;
if (!databaseUrl || !adminPassword) {
  throw new Error(
    "DATABASE_URL and PROJECT42_IDENTITY_ADMIN_PASSWORD are required.",
  );
}

const realm = "project42";
const clientId = "project42-api-browser";
const apiOrigin = "https://localhost:8787";
const learnOrigin = "https://localhost:3000";
const callbackUrl = `${apiOrigin}/v1/auth/callback`;
const providerTransportOrigin = "https://identity.project42.test";
const username = `browser-session-smoke-${crypto.randomUUID()}`;
const email = `${username}@example.test`;
const password = `smoke-${crypto.randomUUID()}-${crypto.randomUUID()}`;
const installationId = `keycloak-browser-session-smoke-${crypto.randomUUID()}`;
const pool = new Pool({ connectionString: databaseUrl, max: 2, ssl: false });
let userId;

class CookieJar {
  values = new Map();

  capture(response) {
    for (const cookie of responseCookies(response)) {
      const pair = cookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value || /;\s*Max-Age=0(?:;|$)/i.test(cookie)) {
        this.values.delete(name);
      } else {
        this.values.set(name, value);
      }
    }
  }

  header() {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

try {
  const discoveryResponse = await fetch(
    `${keycloakBaseUrl}/realms/${realm}/.well-known/openid-configuration`,
  );
  assert.equal(discoveryResponse.status, 200);
  const discovery = await discoveryResponse.json();
  for (const field of [
    "issuer",
    "authorization_endpoint",
    "token_endpoint",
    "jwks_uri",
    "end_session_endpoint",
  ]) {
    assert.equal(typeof discovery[field], "string", `Missing ${field}`);
  }

  userId = await createUser({ username, email, password });

  const database = new PostgresD1CompatibilityDatabase(pool);
  const repository = new D1Project42Repository(database, installationId);
  const environment = {
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
    OIDC_ISSUER: discovery.issuer,
    OIDC_AUDIENCE: "project42-api",
    OIDC_JWKS_URL: discovery.jwks_uri,
    OIDC_EMAIL_CLAIM: "email",
    OIDC_EMAIL_VERIFIED_CLAIM: "email_verified",
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "postgresql",
    ALLOWED_ORIGINS: learnOrigin,
    BOOTSTRAP_OWNER_ISSUER: discovery.issuer,
    BOOTSTRAP_OWNER_SUBJECT: userId,
    OIDC_AUTHORIZATION_ENDPOINT: useProviderTransport(
      discovery.authorization_endpoint,
    ),
    OIDC_TOKEN_ENDPOINT: useProviderTransport(discovery.token_endpoint),
    OIDC_CLIENT_ID: clientId,
    OIDC_REDIRECT_URI: callbackUrl,
    OIDC_LOGOUT_ENDPOINT: useProviderTransport(discovery.end_session_endpoint),
    SESSION_ENCRYPTION_KEY:
      "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  };
  const tokenRequests = [];
  const browserAdapter = new BrowserOidcAdapter(
    environment,
    async (input, init) => {
      const target = useKeycloakTransport(String(input));
      const body = new URLSearchParams(init?.body);
      tokenRequests.push(body);
      return fetch(target, init);
    },
  );
  const verifier = new OidcJwtVerifier(environment);
  const authAbuseLimiter = createSelfHostAuthAbuseLimiter(pool);
  const learningRecordConfiguration = describeLearningRecordAdapter(
    "postgresql",
    "node",
  );
  const api = (request) =>
    handleRequest(
      request,
      environment,
      verifier,
      repository,
      undefined,
      learningRecordConfiguration,
      browserAdapter,
      authAbuseLimiter,
      () => "192.0.2.42",
    );

  const start = await api(
    new Request(
      `${apiOrigin}/v1/auth/start?return_to=${encodeURIComponent(
        `${learnOrigin}/account/`,
      )}`,
    ),
  );
  assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get("location"));
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.ok(authorization.searchParams.get("code_challenge"));
  assert.ok(authorization.searchParams.get("nonce"));
  assert.ok(authorization.searchParams.get("state"));
  const oidcCookie = cookiePair(
    responseCookies(start),
    "__Host-project42_oidc",
  );

  const providerJar = new CookieJar();
  const loginPage = await providerFetch(
    authorization,
    { method: "GET" },
    providerJar,
  );
  assert.equal(loginPage.status, 200);
  const loginAction = readLoginAction(await loginPage.text());
  const loginResponse = await providerFetch(
    loginAction,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: email,
        password,
        credential: password,
      }),
    },
    providerJar,
  );
  if (![302, 303].includes(loginResponse.status)) {
    const loginHtml = await loginResponse.text();
    const providerMessage = loginHtml
      .match(/id=["']input-error["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    throw new Error(
      `Keycloak login returned ${loginResponse.status}` +
        (providerMessage ? `: ${providerMessage}` : "."),
    );
  }
  const providerCallback = new URL(
    loginResponse.headers.get("location"),
    loginAction,
  );
  assert.equal(providerCallback.origin, apiOrigin);
  assert.equal(providerCallback.pathname, "/v1/auth/callback");
  assert.ok(providerCallback.searchParams.get("code"));
  assert.equal(
    providerCallback.searchParams.get("state"),
    authorization.searchParams.get("state"),
  );

  const callback = await api(
    new Request(providerCallback, {
      headers: { cookie: oidcCookie },
    }),
  );
  assert.equal(callback.status, 302);
  assert.equal(
    new URL(callback.headers.get("location")).searchParams.get("auth"),
    "success",
  );
  const sessionCookie = cookiePair(
    responseCookies(callback),
    "__Secure-project42_session",
  );
  assert.ok(
    responseCookies(callback).some(
      (cookie) =>
        cookie.startsWith("__Secure-project42_session=") &&
        cookie.includes("Secure") &&
        cookie.includes("HttpOnly") &&
        cookie.includes("SameSite=Lax") &&
        !cookie.includes("Domain="),
    ),
  );
  assert.equal(tokenRequests.length, 1);
  assert.ok(tokenRequests[0].get("code_verifier")?.length >= 43);

  const session = await api(
    new Request(`${apiOrigin}/v1/auth/session`, {
      headers: { cookie: sessionCookie, origin: learnOrigin },
    }),
  );
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.equal(sessionBody.account.identity.issuer, discovery.issuer);
  assert.equal(sessionBody.account.identity.subject, userId);
  assert.equal(sessionBody.account.primaryEmail, email);
  assert.equal(sessionBody.account.state, "approved");
  assert.deepEqual(
    new Set(sessionBody.account.roles),
    new Set(["learner", "owner"]),
  );

  const renewal = await api(
    new Request(`${apiOrigin}/v1/auth/renew`, {
      method: "POST",
      headers: { cookie: sessionCookie, origin: learnOrigin },
    }),
  );
  assert.equal(renewal.status, 200);
  const replacementCookie = cookiePair(
    responseCookies(renewal),
    "__Secure-project42_session",
  );
  assert.notEqual(replacementCookie, sessionCookie);
  const replacedSession = await api(
    new Request(`${apiOrigin}/v1/auth/session`, {
      headers: { cookie: sessionCookie, origin: learnOrigin },
    }),
  );
  assert.equal(replacedSession.status, 401);
  assert.equal((await replacedSession.json()).error.code, "session_expired");

  const signout = await api(
    new Request(
      `${apiOrigin}/v1/auth/signout?return_to=${encodeURIComponent(
        `${learnOrigin}/account/`,
      )}`,
      {
        method: "POST",
        headers: { cookie: replacementCookie, origin: learnOrigin },
      },
    ),
  );
  assert.equal(signout.status, 200);
  assert.equal((await signout.json()).signedOut, true);
  assert.ok(
    responseCookies(signout).some(
      (cookie) =>
        cookie.startsWith("__Secure-project42_session=") &&
        cookie.includes("Max-Age=0"),
    ),
  );
  const revokedSession = await api(
    new Request(`${apiOrigin}/v1/auth/session`, {
      headers: { cookie: replacementCookie, origin: learnOrigin },
    }),
  );
  assert.equal(revokedSession.status, 401);
  assert.equal((await revokedSession.json()).error.code, "session_expired");

  console.log(
    "Verified real Keycloak authorization code, PKCE, callback, session, " +
      "renewal, and sign-out.",
  );
} finally {
  if (userId) {
    await adminRequest(
      `/admin/realms/${realm}/users/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
      [204, 404],
    ).catch(() => undefined);
  }
  await pool.end();
}

async function providerFetch(input, init, jar) {
  const target = useKeycloakTransport(String(input));
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(target, {
    ...init,
    headers,
    redirect: "manual",
  });
  jar.capture(response);
  return response;
}

function useProviderTransport(value) {
  const source = new URL(value);
  return new URL(
    source.pathname + source.search,
    providerTransportOrigin,
  ).toString();
}

function useKeycloakTransport(value) {
  const source = new URL(value);
  if (source.origin !== providerTransportOrigin) return source;
  return new URL(source.pathname + source.search, keycloakBaseUrl);
}

function readLoginAction(html) {
  const form = html.match(
    /<form\b(?=[^>]*\bid=["']kc-form-login["'])[^>]*>/i,
  )?.[0];
  const action = form?.match(/\baction=["']([^"']+)["']/i)?.[1];
  if (!action) throw new Error("Keycloak login action was not found.");
  return action
    .replaceAll("&amp;", "&")
    .replaceAll("&#x3D;", "=")
    .replaceAll("&#61;", "=");
}

function responseCookies(response) {
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

async function accessToken() {
  const response = await fetch(
    `${keycloakBaseUrl}/realms/master/protocol/openid-connect/token`,
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
  headers.set("authorization", `Bearer ${await accessToken()}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${keycloakBaseUrl}${path}`, {
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

async function createUser(input) {
  const response = await adminRequest(
    `/admin/realms/${realm}/users`,
    {
      method: "POST",
      body: JSON.stringify({
        username: input.username,
        email: input.email,
        firstName: "Browser",
        lastName: "Session Smoke",
        enabled: true,
        emailVerified: true,
        requiredActions: [],
        credentials: [
          {
            type: "password",
            value: input.password,
            temporary: false,
          },
        ],
      }),
    },
    [201],
  );
  const location = response.headers.get("location");
  const id = location?.split("/").at(-1);
  if (!id) throw new Error("Keycloak did not return the created user ID.");
  return id;
}

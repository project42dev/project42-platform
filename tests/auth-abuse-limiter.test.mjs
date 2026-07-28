import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthAbuseLimiterUnavailableError,
  CloudflareAuthAbuseLimiter,
} from "../dist/index.js";
import { handleRequest } from "../dist/worker.js";

class WindowBinding {
  #attempts = new Map();

  constructor(limit) {
    this.limitValue = limit;
  }

  async limit({ key }) {
    const attempts = (this.#attempts.get(key) ?? 0) + 1;
    this.#attempts.set(key, attempts);
    return { success: attempts <= this.limitValue };
  }

  reset() {
    this.#attempts.clear();
  }
}

test("Cloudflare auth limiter caps client and installation without storing raw addresses", async () => {
  const perClient = new WindowBinding(2);
  const perInstallation = new WindowBinding(3);
  const limiter = new CloudflareAuthAbuseLimiter({
    perClient,
    perInstallation,
  });
  const input = {
    installationId: "installation-a",
    route: "start",
    clientAddress: "2001:db8::42",
  };

  assert.equal((await limiter.check(input)).allowed, true);
  assert.equal((await limiter.check(input)).allowed, true);
  assert.equal((await limiter.check(input)).allowed, false);

  perClient.reset();
  perInstallation.reset();
  assert.equal((await limiter.check(input)).allowed, true);
  assert.equal(
    (
      await limiter.check({
        ...input,
        route: "callback",
      })
    ).allowed,
    true,
  );
});

test("Cloudflare auth limiter fails closed when a binding or address is unsafe", async () => {
  const limiter = new CloudflareAuthAbuseLimiter({
    perClient: new WindowBinding(1),
  });
  await assert.rejects(
    () =>
      limiter.check({
        installationId: "installation-a",
        route: "start",
        clientAddress: "192.0.2.1",
      }),
    AuthAbuseLimiterUnavailableError,
  );
  const complete = new CloudflareAuthAbuseLimiter({
    perClient: new WindowBinding(1),
    perInstallation: new WindowBinding(1),
  });
  await assert.rejects(
    () =>
      complete.check({
        installationId: "installation-a",
        route: "start",
        clientAddress: "192.0.2.1, 198.51.100.1",
      }),
    AuthAbuseLimiterUnavailableError,
  );
});

test("auth routes return bounded errors on exhaustion and recover after a window", async () => {
  const decisions = [true, false, true];
  const limiter = {
    check: async () => ({
      allowed: decisions.shift() ?? false,
      retryAfterSeconds: 60,
    }),
  };
  const repository = {
    ensureInstallation: async () => undefined,
    createOidcAuthorizationTransaction: async () => undefined,
  };
  const browserAdapter = {
    createAuthorization: async () => ({
      location: "https://identity.example.test/authorize",
      cookie:
        "__Host-project42_oidc=opaque; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax",
    }),
  };
  const env = {
    INSTALLATION_ID: "rate-limit-worker-test",
    ALLOWED_ORIGINS: "https://learn.example.test",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };
  const request = () =>
    new Request("https://api.example.test/v1/auth/start", {
      headers: { "CF-Connecting-IP": "192.0.2.42" },
    });
  const api = () =>
    handleRequest(
      request(),
      env,
      {},
      repository,
      undefined,
      undefined,
      browserAdapter,
      limiter,
    );

  assert.equal((await api()).status, 302);
  const exhausted = await api();
  assert.equal(exhausted.status, 429);
  assert.equal(exhausted.headers.get("retry-after"), "60");
  assert.equal(
    (await exhausted.json()).error.code,
    "authentication_rate_limited",
  );
  assert.equal((await api()).status, 302);

  const unavailable = await handleRequest(
    request(),
    env,
    {},
    repository,
    undefined,
    undefined,
    browserAdapter,
    {
      check: async () => {
        throw new Error("binding outage");
      },
    },
  );
  assert.equal(unavailable.status, 503);
  assert.equal(
    (await unavailable.json()).error.code,
    "authentication_protection_unavailable",
  );

  const callbackExhausted = await handleRequest(
    new Request(
      "https://api.example.test/v1/auth/callback?code=opaque&state=opaque",
      { headers: { "CF-Connecting-IP": "192.0.2.42" } },
    ),
    env,
    {},
    repository,
    undefined,
    undefined,
    {
      readTransaction: async () => {
        throw new Error("Callback parsing must not run after rate limiting.");
      },
    },
    {
      check: async ({ route }) => ({
        allowed: route !== "callback",
        retryAfterSeconds: 30,
      }),
    },
  );
  assert.equal(callbackExhausted.status, 429);
  assert.equal(callbackExhausted.headers.get("retry-after"), "30");

  const missingTrustedAddress = await handleRequest(
    new Request("https://api.example.test/v1/auth/start"),
    env,
    {},
    repository,
    undefined,
    undefined,
    browserAdapter,
    limiter,
  );
  assert.equal(missingTrustedAddress.status, 503);
  assert.equal(
    (await missingTrustedAddress.json()).error.code,
    "authentication_protection_unavailable",
  );
});

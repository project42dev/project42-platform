import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IdentityProvisioningEngine,
  InMemoryIdentityProvisioningRecordStore,
  KeycloakIdentityProvisioningAdapter,
  keycloakIdentityProviderCompatibility,
} from "../dist/index.js";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../examples/identity-provisioning/api-plan.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const authorityDigest =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

class TestSecretSink {
  constructor() {
    this.values = new Map();
    this.revoked = new Set();
    this.storeCalls = 0;
  }

  async store(request) {
    this.storeCalls += 1;
    const value = new Uint8Array(request.material.value);
    const digest = await sha256Bytes(value);
    const secretRef = `secret-${request.clientRef}`;
    const versionRef = `version-${this.storeCalls}`;
    this.values.set(`${secretRef}:${versionRef}`, value);
    return {
      secretManagerRef: request.secretManagerRef,
      secretRef,
      versionRef,
      valueDigest: digest,
      status: "active",
      createdAt: "2026-07-28T10:00:00.000Z",
      expiresAt: request.material.expiresAt,
    };
  }

  async revoke(reference) {
    this.revoked.add(`${reference.secretRef}:${reference.versionRef}`);
  }
}

class KeycloakAdminApi {
  constructor(issuer) {
    this.issuer = issuer;
    this.clients = new Map();
    this.requests = [];
    this.secretCounter = 0;
    this.currentSecret = null;
    this.rotatedSecret = null;
    this.failNext = false;
  }

  async fetch(input, init = {}) {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const authorization = new Headers(init.headers).get("Authorization");
    this.requests.push({
      method,
      path: url.pathname,
      query: url.search,
      hasAuthorization: authorization !== null,
    });
    if (this.failNext) {
      this.failNext = false;
      throw new Error("simulated Keycloak outage");
    }

    if (
      method === "GET" &&
      url.pathname.endsWith("/.well-known/openid-configuration")
    ) {
      assert.equal(authorization, null);
      return jsonResponse({ issuer: this.issuer });
    }
    assert.equal(authorization, "Bearer test-keycloak-admin-token");

    const clientsPath = "/admin/realms/project42/clients";
    if (method === "GET" && url.pathname === clientsPath) {
      const clientId = url.searchParams.get("clientId");
      const client = this.clients.get(clientId);
      return jsonResponse(client ? [structuredClone(client)] : []);
    }
    if (method === "POST" && url.pathname === clientsPath) {
      const representation = JSON.parse(init.body);
      if (this.clients.has(representation.clientId)) {
        return jsonResponse({}, 409);
      }
      this.clients.set(representation.clientId, {
        ...representation,
        id: `uuid-${representation.clientId}`,
      });
      return emptyResponse(201);
    }

    const match = url.pathname.match(
      /^\/admin\/realms\/project42\/clients\/([^/]+)(.*)$/,
    );
    if (!match) return jsonResponse({}, 404);
    const internalId = decodeURIComponent(match[1]);
    const suffix = match[2];
    const client = [...this.clients.values()].find(
      (candidate) => candidate.id === internalId,
    );
    if (!client) return jsonResponse({}, 404);

    if (suffix === "" && method === "PUT") {
      const representation = JSON.parse(init.body);
      this.clients.set(representation.clientId, {
        ...representation,
        id: internalId,
      });
      return emptyResponse(204);
    }
    if (suffix === "" && method === "DELETE") {
      this.clients.delete(client.clientId);
      return emptyResponse(204);
    }
    if (suffix === "/client-secret" && method === "POST") {
      this.rotatedSecret = this.currentSecret;
      this.currentSecret =
        `keycloak-generated-secret-${++this.secretCounter}`;
      return jsonResponse({
        type: "secret",
        value: this.currentSecret,
      });
    }
    if (suffix === "/client-secret" && method === "GET") {
      return jsonResponse({
        type: "secret",
        value: this.currentSecret,
      });
    }
    if (
      suffix === "/client-secret/rotated" &&
      method === "DELETE"
    ) {
      this.rotatedSecret = null;
      return emptyResponse(204);
    }
    return jsonResponse({}, 404);
  }
}

function plan(overrides = {}) {
  const value = structuredClone(fixture);
  value.provider = {
    id: "keycloak",
    adapterVersion: "1.0.0",
    mode: "api",
    issuer:
      "https://identity.example.test/realms/project42",
    authorityBoundary: {
      kind: "tenant-admin",
      referenceDigest: authorityDigest,
    },
    capabilities: [
      "create",
      "validate",
      "observe",
      "reconcile",
      "rotate",
      "recover",
      "disable",
      "retire",
    ],
  };
  value.client.clientRef = "project42-test-client";
  value.client.permissions = [];
  return Object.assign(value, overrides);
}

function runtime(api, store, sink) {
  let clock = Date.parse("2026-07-28T10:00:00.000Z");
  let sequence = 0;
  const adapter = new KeycloakIdentityProvisioningAdapter({
    baseUrl: "https://identity.example.test",
    realm: "project42",
    authorityReferenceDigest: authorityDigest,
    accessToken: async () => "test-keycloak-admin-token",
    fetch: api.fetch.bind(api),
  });
  return {
    adapter,
    engine: new IdentityProvisioningEngine({
      store,
      secretSink: sink,
      adapters: [adapter],
      now: () => {
        const value = new Date(clock).toISOString();
        clock += 1_000;
        return value;
      },
      createId: (kind) => `${kind}-${++sequence}`,
    }),
  };
}

test("declares current Keycloak API lifecycle compatibility", () => {
  const compatibility = keycloakIdentityProviderCompatibility();
  assert.equal(compatibility.provider, "keycloak");
  assert.deepEqual(compatibility.modes, ["api"]);
  assert.equal(compatibility.operations.length, 8);
  assert.equal(compatibility.authorityGates.length, 8);
  assert.equal(
    compatibility.authorityGates.every(
      (gate) =>
        gate.requiredAuthority === "tenant-admin" &&
        gate.interactive === false,
    ),
    true,
  );
  assert.deepEqual(
    compatibility.secretKinds,
    ["none", "client-secret"],
  );
});

test("creates a confidential client and reruns idempotently", async () => {
  const selectedPlan = plan();
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);
  const request = {
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-create-operation-0001",
    actor: "automation",
  };

  const created = await engine.run(request);
  const callsAfterCreate = api.requests.length;
  const rerun = await engine.run(request);

  assert.equal(created.state, "ready");
  assert.equal(rerun.state, "ready");
  assert.equal(api.requests.length, callsAfterCreate);
  assert.equal(sink.storeCalls, 1);
  assert.equal(created.observation.callbacksVerified, true);
  assert.equal(created.observation.permissionsVerified, true);
  assert.equal(created.observation.credentialVerified, true);
  assert.equal(
    api.requests
      .filter((request) =>
        request.path.endsWith("/.well-known/openid-configuration")
      )
      .every((request) => request.hasAuthorization === false),
    true,
  );
  assert.equal(
    JSON.stringify(store.snapshot()).includes(
      api.currentSecret,
    ),
    false,
  );
});

test("fails closed when the configured authority digest differs", async () => {
  const selectedPlan = plan();
  selectedPlan.provider.authorityBoundary.referenceDigest =
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);

  const result = await engine.run({
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-wrong-authority-0001",
    actor: "automation",
  });

  assert.equal(result.state, "failed");
  assert.equal(result.error.retryable, true);
  assert.equal(api.requests.length, 0);
});

test("rejects an issuer outside the configured realm without a token", async () => {
  const selectedPlan = plan();
  selectedPlan.provider.issuer =
    "https://attacker.example.invalid/realms/project42";
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);

  const result = await engine.run({
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-wrong-issuer-0001",
    actor: "automation",
  });

  assert.equal(result.state, "failed");
  assert.equal(api.requests.length, 0);
});

test("refuses to adopt an untracked existing provider client", async () => {
  const selectedPlan = plan();
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  api.clients.set(selectedPlan.client.clientRef, {
    id: "uuid-untracked-client",
    clientId: selectedPlan.client.clientRef,
    enabled: true,
  });
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);

  const result = await engine.run({
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-untracked-client-0001",
    actor: "automation",
  });

  assert.equal(result.state, "failed");
  assert.equal(result.error.retryable, true);
  assert.equal(sink.storeCalls, 0);
});

test("detects callback drift and recovers with the same operation", async () => {
  const selectedPlan = plan();
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);
  await engine.run({
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-drift-create-0001",
    actor: "automation",
  });
  api.clients.get(selectedPlan.client.clientRef).redirectUris = [
    "https://attacker.example.invalid/callback",
  ];
  const validation = {
    plan: selectedPlan,
    operation: "validate",
    idempotencyKey: "keycloak-drift-validate-0001",
    actor: "automation",
  };

  const blocked = await engine.run(validation);
  assert.equal(blocked.state, "failed");
  assert.equal(
    blocked.drift.some((finding) =>
      finding.code === "callback-mismatch"
    ),
    true,
  );

  api.clients.get(selectedPlan.client.clientRef).redirectUris =
    [...selectedPlan.client.redirectUris];
  const recovered = await engine.run(validation);
  assert.equal(recovered.state, "ready");
  assert.equal(recovered.attempt, 2);
});

test("recovers from an interrupted provider request", async () => {
  const selectedPlan = plan();
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);
  api.failNext = true;
  const request = {
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-provider-recovery-0001",
    actor: "automation",
  };

  const failed = await engine.run(request);
  const recovered = await engine.run(request);

  assert.equal(failed.state, "failed");
  assert.equal(failed.error.retryable, true);
  assert.equal(recovered.state, "ready");
  assert.equal(recovered.attempt, 2);
  assert.equal(sink.storeCalls, 1);
});

test("rotates with overlap and revokes the prior versions", async () => {
  const selectedPlan = plan();
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);
  const created = await engine.run({
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-rotation-create-0001",
    actor: "automation",
  });

  const rotated = await engine.run({
    plan: selectedPlan,
    operation: "rotate",
    idempotencyKey: "keycloak-rotation-operation-0001",
    actor: "automation",
  });

  assert.equal(rotated.state, "ready");
  assert.notEqual(
    rotated.secret.versionRef,
    created.secret.versionRef,
  );
  assert.equal(
    sink.revoked.has(
      `${created.secret.secretRef}:${created.secret.versionRef}`,
    ),
    true,
  );
  assert.equal(api.rotatedSecret, null);
});

test("disables and retires the provider client idempotently", async () => {
  const selectedPlan = plan();
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);
  await engine.run({
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-retire-create-0001",
    actor: "automation",
  });
  const disabled = await engine.run({
    plan: selectedPlan,
    operation: "disable",
    idempotencyKey: "keycloak-disable-operation-0001",
    actor: "automation",
  });
  const retireRequest = {
    plan: selectedPlan,
    operation: "retire",
    idempotencyKey: "keycloak-retire-operation-0001",
    actor: "automation",
  };
  const retired = await engine.run(retireRequest);
  const requestCount = api.requests.length;
  const rerun = await engine.run(retireRequest);

  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.observation.clientEnabled, false);
  assert.equal(retired.state, "retired");
  assert.equal(retired.secret.status, "revoked");
  assert.equal(api.clients.size, 0);
  assert.equal(rerun.state, "retired");
  assert.equal(api.requests.length, requestCount);
});

test("creates a browser-public client without requesting a secret", async () => {
  const selectedPlan = plan();
  selectedPlan.client.clientKind = "browser-public";
  selectedPlan.client.tokenEndpointAuthMethod = "none";
  selectedPlan.secretPolicy = {
    required: false,
    secretManagerRef: "not-used",
    rotationIntervalDays: null,
    overlapRequired: false,
  };
  const api = new KeycloakAdminApi(selectedPlan.provider.issuer);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new TestSecretSink();
  const { engine } = runtime(api, store, sink);

  const created = await engine.run({
    plan: selectedPlan,
    operation: "create",
    idempotencyKey: "keycloak-public-create-0001",
    actor: "automation",
  });

  assert.equal(created.state, "ready");
  assert.equal(created.secret, null);
  assert.equal(sink.storeCalls, 0);
  assert.equal(
    api.requests.some((request) =>
      request.path.endsWith("/client-secret")
    ),
    false,
  );
  assert.equal(
    api.clients.get(selectedPlan.client.clientRef)
      .attributes["pkce.code.challenge.method"],
    "S256",
  );
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status) {
  return new Response(null, { status });
}

async function sha256Bytes(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

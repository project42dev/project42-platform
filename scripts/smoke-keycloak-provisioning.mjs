import assert from "node:assert/strict";
import {
  IdentityProvisioningEngine,
  InMemoryIdentityProvisioningRecordStore,
  KeycloakIdentityProvisioningAdapter,
} from "../dist/index.js";

const baseUrl =
  process.env.PROJECT42_KEYCLOAK_BASE_URL ??
  "http://127.0.0.1:8080";
const realm = "project42";
const clientRef = "project42-provisioning-smoke";
const adminPassword =
  process.env.PROJECT42_IDENTITY_ADMIN_PASSWORD;
if (!adminPassword) {
  throw new Error(
    "PROJECT42_IDENTITY_ADMIN_PASSWORD is required for the smoke test.",
  );
}

const authorityDigest =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const issuer = `${baseUrl}/realms/${realm}`;

class SmokeSecretSink {
  constructor() {
    this.values = new Map();
    this.revoked = new Set();
    this.storeCalls = 0;
  }

  async store(request) {
    this.storeCalls += 1;
    const value = new Uint8Array(request.material.value);
    const digest = await sha256(value);
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
      expiresAt: null,
    };
  }

  async revoke(reference) {
    this.revoked.add(
      `${reference.secretRef}:${reference.versionRef}`,
    );
  }
}

const store = new InMemoryIdentityProvisioningRecordStore();
const secretSink = new SmokeSecretSink();
let clock = Date.parse("2026-07-28T10:00:00.000Z");
let sequence = 0;

async function accessToken() {
  const response = await fetch(
    `${baseUrl}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: "admin-cli",
        username: "bootstrap-admin",
        password: adminPassword,
        grant_type: "password",
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Keycloak administration token request returned ${response.status}.`,
    );
  }
  const result = await response.json();
  if (
    typeof result.access_token !== "string" ||
    result.access_token.length < 32
  ) {
    throw new Error(
      "Keycloak did not return an administration access token.",
    );
  }
  return result.access_token;
}

const adapter = new KeycloakIdentityProvisioningAdapter({
  baseUrl,
  realm,
  authorityReferenceDigest: authorityDigest,
  accessToken,
});
const engine = new IdentityProvisioningEngine({
  store,
  secretSink,
  adapters: [adapter],
  now: () => {
    const value = new Date(clock).toISOString();
    clock += 1_000;
    return value;
  },
  createId: (kind) => `${kind}-smoke-${++sequence}`,
});
const plan = {
  schemaVersion: "1.0",
  planId: "keycloak-smoke-plan",
  installationRef: "self-host-smoke-installation",
  createdAt: "2026-07-28T10:00:00.000Z",
  desiredStateDigest:
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  provider: {
    id: "keycloak",
    adapterVersion: "1.0.0",
    mode: "api",
    issuer,
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
  },
  client: {
    clientRef,
    clientKind: "api-confidential",
    redirectUris: [
      "http://localhost:3000/auth/callback",
    ],
    postLogoutRedirectUris: [
      "http://localhost:3000/",
    ],
    allowedOrigins: ["http://localhost:3000"],
    grantTypes: ["authorization_code"],
    tokenEndpointAuthMethod: "client_secret_basic",
    pkceRequired: true,
    scopes: ["openid", "profile", "email"],
    permissions: [],
  },
  secretPolicy: {
    required: true,
    secretManagerRef: "smoke-secret-manager",
    rotationIntervalDays: 90,
    overlapRequired: true,
  },
};

try {
  const createRequest = {
    plan,
    operation: "create",
    idempotencyKey: "keycloak-smoke-create-0001",
    actor: "automation",
  };
  const created = await engine.run(createRequest);
  assert.equal(created.state, "ready");
  const storedAfterCreate = secretSink.storeCalls;
  const rerun = await engine.run(createRequest);
  assert.equal(rerun.state, "ready");
  assert.equal(secretSink.storeCalls, storedAfterCreate);

  const client = await requireClient();
  await adminRequest(
    `/admin/realms/${realm}/clients/${encodeURIComponent(client.id)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        ...client,
        redirectUris: [
          "http://localhost:3000/drifted-callback",
        ],
      }),
    },
    [204],
  );
  const drifted = await engine.run({
    plan,
    operation: "validate",
    idempotencyKey: "keycloak-smoke-validate-0001",
    actor: "automation",
  });
  assert.equal(drifted.state, "failed");
  assert.equal(
    drifted.drift.some(
      (finding) => finding.code === "callback-mismatch",
    ),
    true,
  );

  const reconciled = await engine.run({
    plan,
    operation: "reconcile",
    idempotencyKey: "keycloak-smoke-reconcile-0001",
    actor: "automation",
  });
  assert.equal(reconciled.state, "ready");

  const rotated = await engine.run({
    plan,
    operation: "rotate",
    idempotencyKey: "keycloak-smoke-rotate-0001",
    actor: "automation",
  });
  assert.equal(rotated.state, "ready");
  assert.notEqual(
    rotated.secret.versionRef,
    created.secret.versionRef,
  );
  assert.equal(
    secretSink.revoked.has(
      `${created.secret.secretRef}:${created.secret.versionRef}`,
    ),
    true,
  );

  const disabled = await engine.run({
    plan,
    operation: "disable",
    idempotencyKey: "keycloak-smoke-disable-0001",
    actor: "automation",
  });
  assert.equal(disabled.state, "disabled");

  const recovered = await engine.run({
    plan,
    operation: "recover",
    idempotencyKey: "keycloak-smoke-recover-0001",
    actor: "automation",
  });
  assert.equal(recovered.state, "ready");

  const retired = await engine.run({
    plan,
    operation: "retire",
    idempotencyKey: "keycloak-smoke-retire-0001",
    actor: "automation",
  });
  assert.equal(retired.state, "retired");
  assert.equal(retired.secret.status, "revoked");
  assert.equal(await findClient(), null);

  console.log(
    "Verified real Keycloak create, rerun, drift, reconcile, rotation, " +
      "disablement, recovery, and retirement.",
  );
} finally {
  await removeClientIfPresent();
}

async function adminRequest(path, init, expectedStatuses) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `Keycloak smoke administration request returned ${response.status}.`,
    );
  }
  return response;
}

async function findClient() {
  const query = new URLSearchParams({
    clientId: clientRef,
    exact: "true",
  });
  const response = await adminRequest(
    `/admin/realms/${realm}/clients?${query}`,
    { method: "GET" },
    [200],
  );
  const clients = await response.json();
  if (!Array.isArray(clients) || clients.length > 1) {
    throw new Error(
      "Keycloak smoke client lookup was invalid or ambiguous.",
    );
  }
  return clients[0] ?? null;
}

async function requireClient() {
  const client = await findClient();
  if (!client?.id) {
    throw new Error("Keycloak smoke client was not found.");
  }
  return client;
}

async function removeClientIfPresent() {
  try {
    const client = await findClient();
    if (client?.id) {
      await adminRequest(
        `/admin/realms/${realm}/clients/${encodeURIComponent(client.id)}`,
        { method: "DELETE" },
        [204],
      );
    }
  } catch {
    // Preserve the primary smoke failure; Compose teardown removes the test realm.
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

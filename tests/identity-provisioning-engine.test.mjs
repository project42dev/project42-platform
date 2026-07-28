import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IdentityProvisioningEngine,
  IdentityProvisioningEngineError,
  InMemoryIdentityProvisioningRecordStore,
  validateIdentityProvisioningRecord,
} from "../dist/index.js";

const exampleRoot = new URL(
  "../examples/identity-provisioning/",
  import.meta.url,
);

async function json(name) {
  return JSON.parse(await readFile(new URL(name, exampleRoot), "utf8"));
}

const [apiPlanFixture, ownerPlanFixture] = await Promise.all([
  json("api-plan.json"),
  json("owner-gate-plan.json"),
]);

class ReferenceSecretSink {
  constructor() {
    this.values = new Map();
    this.storeCalls = 0;
    this.revoked = new Set();
  }

  async store(request) {
    this.storeCalls += 1;
    const value = new Uint8Array(request.material.value);
    const digest = await sha256Bytes(value);
    const secretRef = `secret-${request.clientRef}`;
    const versionRef = `version-${String(this.storeCalls).padStart(4, "0")}`;
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

  rawValueCount() {
    return this.values.size;
  }
}

class ReferenceProviderAdapter {
  constructor(plan, options = {}) {
    this.calls = [];
    this.ownerGate = options.ownerGate ?? false;
    this.continuationValue =
      options.continuationValue ?? "owner-confirmation-value";
    this.continuationDigest = options.continuationDigest;
    this.callbackDrift = false;
    this.failNext = false;
    this.compatibility = {
      schemaVersion: "1.0",
      provider: plan.provider.id,
      adapterVersion: plan.provider.adapterVersion,
      evidenceReviewedAt: "2026-07-28",
      evidenceSources: [
        this.ownerGate
          ? "https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest"
          : "https://learn.microsoft.com/en-us/graph/api/application-post-applications",
      ],
      modes: [plan.provider.mode],
      operations: [
        "create",
        "validate",
        "observe",
        "reconcile",
        "rotate",
        "recover",
        "disable",
        "retire",
      ],
      clientKinds: [plan.client.clientKind],
      authorityGates: this.ownerGate
        ? [
            {
              operation: "create",
              requiredAuthority: "organization-admin",
              interactive: true,
              reasonCode: "provider-owner-confirmation-required",
            },
          ]
        : [
            {
              operation: "create",
              requiredAuthority: "tenant-admin",
              interactive: false,
              reasonCode: "provisioning-authority-preapproved",
            },
          ],
      secretKinds: ["client-secret"],
      overlappingRotation: true,
      registrationManagement: !this.ownerGate,
      recovery: true,
    };
  }

  async execute(operation, plan, previous, context) {
    this.calls.push({
      operation,
      idempotencyKey: context.idempotencyKey,
      previousState: previous?.state ?? null,
    });
    if (this.failNext) {
      this.failNext = false;
      throw new Error("simulated provider outage");
    }
    if (
      this.ownerGate &&
      operation === "create" &&
      previous?.continuation?.status !== "approved"
    ) {
      return {
        nextState: "awaiting-authority",
        continuation: {
          gateId: "gate-reference-owner",
          requiredAuthority: "organization-admin",
          reasonCode: "provider-requires-owner-confirmation",
          continuationDigest: this.continuationDigest,
          providerActionUrl:
            "https://github.com/organizations/example/settings/apps/new",
          expiresAt: "2026-07-28T11:00:00.000Z",
          status: "pending",
        },
        secret: null,
        observation: null,
        rollback: {
          allowed: false,
          restoreState: null,
          reasonCode: "no-provider-write",
          snapshotDigest: null,
        },
        error: null,
        detailCode: "owner-gate-created",
      };
    }

    if (operation === "disable") {
      return {
        nextState: "disabled",
        continuation: null,
        secret: previous?.secret ?? null,
        observation: observation(plan, { clientEnabled: false }),
        rollback: rollback("ready"),
        error: null,
        detailCode: "client-disabled",
      };
    }

    if (operation === "retire") {
      if (previous?.secret) await context.secretSink.revoke(previous.secret);
      return {
        nextState: "retired",
        continuation: null,
        secret: previous?.secret
          ? { ...previous.secret, status: "revoked" }
          : null,
        observation: null,
        rollback: {
          allowed: false,
          restoreState: null,
          reasonCode: "provider-client-retired",
          snapshotDigest: null,
        },
        error: null,
        detailCode: "client-retired",
      };
    }

    let secret = previous?.secret ?? null;
    if (operation === "create" || operation === "rotate") {
      const priorSecret = secret;
      secret = await context.secretSink.store({
        operationId: previous?.operationId ?? "operation-reference",
        clientRef: plan.client.clientRef,
        secretManagerRef: plan.secretPolicy.secretManagerRef,
        material: {
          kind: "client-secret",
          value: new TextEncoder().encode(
            `${operation}-${context.idempotencyKey}`,
          ),
          expiresAt: "2027-01-24T10:00:00.000Z",
        },
      });
      if (operation === "rotate" && priorSecret) {
        await context.secretSink.revoke(priorSecret);
      }
    }

    return {
      nextState: "validating",
      continuation: null,
      secret,
      observation: observation(plan, {
        callbacksVerified: !this.callbackDrift,
      }),
      rollback: rollback(previous?.state ?? "planned"),
      error: null,
      detailCode: `${operation}-provider-complete`,
    };
  }
}

function observation(plan, overrides = {}) {
  return {
    observedAt: "2026-07-28T10:00:00.000Z",
    providerClientRefDigest:
      "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    observedStateDigest: plan.desiredStateDigest,
    ownershipVerified: true,
    issuerVerified: true,
    callbacksVerified: true,
    permissionsVerified: true,
    credentialVerified: true,
    clientEnabled: true,
    ...overrides,
  };
}

function rollback(restoreState) {
  return {
    allowed: true,
    restoreState,
    reasonCode: "provider-snapshot-available",
    snapshotDigest:
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  };
}

function createClock(start = "2026-07-28T10:00:00.000Z") {
  let value = Date.parse(start);
  return () => {
    const result = new Date(value).toISOString();
    value += 1_000;
    return result;
  };
}

function createIds() {
  let value = 0;
  return (kind) => `${kind}-${String(++value).padStart(4, "0")}`;
}

function engine(store, sink, adapters, start) {
  return new IdentityProvisioningEngine({
    store,
    secretSink: sink,
    adapters,
    now: createClock(start),
    createId: createIds(),
  });
}

test("API provisioning reaches readiness without persisting raw credentials", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  const runtime = engine(store, sink, [adapter]);

  const record = await runtime.run({
    plan,
    operation: "create",
    idempotencyKey: "api-first-deployment-0001",
    actor: "automation",
  });

  assert.equal(record.state, "ready");
  assert.equal(record.secret.status, "active");
  assert.equal(record.observation.callbacksVerified, true);
  assert.deepEqual(record.drift, []);
  assert.equal(sink.storeCalls, 1);
  assert.equal(sink.rawValueCount(), 1);
  assert.doesNotMatch(
    JSON.stringify(record),
    /api-first-deployment-0001"[^}]*create-api-first-deployment/i,
  );
  assert.doesNotMatch(
    JSON.stringify(record),
    /clientSecret|secretValue|accessToken|privateKey/,
  );
  assert.deepEqual(validateIdentityProvisioningRecord(record), {
    valid: true,
    errors: [],
  });
});

test("same idempotency key returns the original result without a provider write", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  const runtime = engine(store, sink, [adapter]);
  const request = {
    plan,
    operation: "create",
    idempotencyKey: "api-idempotent-deployment-0001",
    actor: "automation",
  };

  const first = await runtime.run(request);
  const second = await runtime.run(request);

  assert.deepEqual(second, first);
  assert.equal(adapter.calls.length, 1);
  assert.equal(sink.storeCalls, 1);
  assert.equal(store.snapshot().length, 1);
});

test("a different create idempotency key cannot duplicate an existing client", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  const runtime = engine(store, sink, [adapter]);

  await runtime.run({
    plan,
    operation: "create",
    idempotencyKey: "api-original-deployment-0001",
    actor: "automation",
  });
  const duplicate = await runtime.run({
    plan,
    operation: "create",
    idempotencyKey: "api-duplicate-deployment-0002",
    actor: "automation",
  });

  assert.equal(duplicate.state, "failed");
  assert.equal(duplicate.error.code, "client-already-provisioned");
  assert.equal(adapter.calls.length, 1);
  assert.equal(sink.storeCalls, 1);
});

test("owner gate survives engine restart and resumes only with bound proof", async () => {
  const plan = structuredClone(ownerPlanFixture);
  const continuationValue = "owner-confirmation-value";
  const continuationDigest = await sha256(continuationValue);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan, {
    ownerGate: true,
    continuationValue,
    continuationDigest,
  });
  const firstRuntime = engine(store, sink, [adapter]);
  const request = {
    plan,
    operation: "create",
    idempotencyKey: "owner-gate-deployment-0001",
    actor: "automation",
  };

  const pending = await firstRuntime.run(request);
  const rerun = await firstRuntime.run(request);
  assert.equal(pending.state, "awaiting-authority");
  assert.deepEqual(rerun, pending);
  assert.equal(adapter.calls.length, 1);

  const rehydratedStore = new InMemoryIdentityProvisioningRecordStore(
    store.snapshot(),
  );
  const resumedRuntime = engine(
    rehydratedStore,
    sink,
    [adapter],
    "2026-07-28T10:10:00.000Z",
  );
  await assert.rejects(
    resumedRuntime.decideAuthority({
      plan,
      idempotencyKey: request.idempotencyKey,
      actor: "tenant-admin",
      decision: "approved",
      continuationValue,
    }),
    (error) =>
      error instanceof IdentityProvisioningEngineError &&
      error.code === "wrong-authority-class",
  );
  await assert.rejects(
    resumedRuntime.decideAuthority({
      plan,
      idempotencyKey: request.idempotencyKey,
      actor: "organization-admin",
      decision: "approved",
      continuationValue: "wrong-proof",
    }),
    (error) =>
      error instanceof IdentityProvisioningEngineError &&
      error.code === "continuation-proof-invalid",
  );

  const ready = await resumedRuntime.decideAuthority({
    plan,
    idempotencyKey: request.idempotencyKey,
    actor: "organization-admin",
    decision: "approved",
    continuationValue,
  });
  assert.equal(ready.state, "ready");
  assert.equal(ready.continuation.status, "approved");
  assert.equal(sink.storeCalls, 1);
  assert.equal(adapter.calls.length, 2);
  assert.equal(
    ready.audit.filter(
      (event) => event.eventType === "authority-decision-rejected",
    ).length,
    2,
  );
});

test("denied and expired authority gates fail closed without provider writes", async () => {
  const base = structuredClone(ownerPlanFixture);
  const continuationValue = "owner-confirmation-value";
  const continuationDigest = await sha256(continuationValue);

  for (const scenario of ["denied", "expired"]) {
    const plan = structuredClone(base);
    plan.planId = `plan-${scenario}-owner-gate`;
    plan.client.clientRef = `client-${scenario}-owner-gate`;
    const store = new InMemoryIdentityProvisioningRecordStore();
    const sink = new ReferenceSecretSink();
    const adapter = new ReferenceProviderAdapter(plan, {
      ownerGate: true,
      continuationValue,
      continuationDigest,
    });
    const start =
      scenario === "expired"
        ? "2026-07-28T11:00:01.000Z"
        : "2026-07-28T10:20:00.000Z";
    const runtime = engine(store, sink, [adapter], start);
    const idempotencyKey = `${scenario}-owner-gate-deployment-0001`;

    await runtime.run({
      plan,
      operation: "create",
      idempotencyKey,
      actor: "automation",
    });
    const result = await runtime.decideAuthority({
      plan,
      idempotencyKey,
      actor: "organization-admin",
      decision: scenario === "denied" ? "denied" : "approved",
      continuationValue,
    });

    assert.equal(result.state, "failed");
    assert.equal(
      result.error.code,
      scenario === "denied"
        ? "authority-gate-denied"
        : "authority-gate-expired",
    );
    assert.equal(sink.storeCalls, 0);
    assert.equal(adapter.calls.length, 1);
  }
});

test("provider failure is resumable and increments the durable attempt", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  adapter.failNext = true;
  const runtime = engine(store, sink, [adapter]);
  const request = {
    plan,
    operation: "create",
    idempotencyKey: "api-recovery-deployment-0001",
    actor: "automation",
  };

  const failed = await runtime.run(request);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error.retryable, true);
  assert.equal(failed.attempt, 1);

  const recovered = await runtime.run(request);
  assert.equal(recovered.state, "ready");
  assert.equal(recovered.attempt, 2);
  assert.equal(adapter.calls.length, 2);
  assert.equal(sink.storeCalls, 1);
});

test("callback drift blocks readiness and the same operation can recover", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  const runtime = engine(store, sink, [adapter]);

  await runtime.run({
    plan,
    operation: "create",
    idempotencyKey: "api-drift-base-0001",
    actor: "automation",
  });
  adapter.callbackDrift = true;
  const request = {
    plan,
    operation: "reconcile",
    idempotencyKey: "api-drift-reconcile-0001",
    actor: "automation",
  };
  const drifted = await runtime.run(request);
  assert.equal(drifted.state, "failed");
  assert.equal(drifted.error.code, "post-registration-validation-failed");
  assert.ok(
    drifted.drift.some(
      (finding) =>
        finding.code === "callback-mismatch" &&
        finding.securityCritical,
    ),
  );

  adapter.callbackDrift = false;
  const recovered = await runtime.run(request);
  assert.equal(recovered.state, "ready");
  assert.equal(recovered.attempt, 2);
  assert.deepEqual(recovered.drift, []);
});

test("rotation validates the replacement before revoking the prior version", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  const runtime = engine(store, sink, [adapter]);
  const created = await runtime.run({
    plan,
    operation: "create",
    idempotencyKey: "api-rotation-base-0001",
    actor: "automation",
  });

  const rotated = await runtime.run({
    plan,
    operation: "rotate",
    idempotencyKey: "api-rotation-operation-0001",
    actor: "automation",
  });

  assert.equal(rotated.state, "ready");
  assert.notEqual(rotated.secret.versionRef, created.secret.versionRef);
  assert.equal(sink.storeCalls, 2);
  assert.equal(
    sink.revoked.has(
      `${created.secret.secretRef}:${created.secret.versionRef}`,
    ),
    true,
  );
});

test("upgrade reconciliation, disablement, and retirement preserve lifecycle evidence", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  const firstRuntime = engine(store, sink, [adapter]);
  await firstRuntime.run({
    plan,
    operation: "create",
    idempotencyKey: "api-upgrade-base-0001",
    actor: "automation",
  });

  const upgradedPlan = structuredClone(plan);
  upgradedPlan.planId = "plan-api-reference-upgrade";
  upgradedPlan.provider.adapterVersion = "1.1.0";
  upgradedPlan.desiredStateDigest =
    "abababababababababababababababababababababababababababababababab";
  const upgradedAdapter = new ReferenceProviderAdapter(upgradedPlan);
  const upgradedRuntime = engine(
    store,
    sink,
    [upgradedAdapter],
    "2026-07-28T10:30:00.000Z",
  );
  const reconciled = await upgradedRuntime.run({
    plan: upgradedPlan,
    operation: "reconcile",
    idempotencyKey: "api-upgrade-reconcile-0001",
    actor: "automation",
  });
  assert.equal(reconciled.state, "ready");
  assert.equal(
    reconciled.observation.observedStateDigest,
    upgradedPlan.desiredStateDigest,
  );

  const disabled = await upgradedRuntime.run({
    plan: upgradedPlan,
    operation: "disable",
    idempotencyKey: "api-disable-operation-0001",
    actor: "operator",
  });
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.observation.clientEnabled, false);

  const retired = await upgradedRuntime.run({
    plan: upgradedPlan,
    operation: "retire",
    idempotencyKey: "api-retire-operation-0001",
    actor: "operator",
  });
  assert.equal(retired.state, "retired");
  assert.equal(retired.secret.status, "revoked");
  assert.equal(
    await upgradedRuntime.run({
      plan: upgradedPlan,
      operation: "retire",
      idempotencyKey: "api-retire-operation-0001",
      actor: "operator",
    }).then((record) => record.operationId),
    retired.operationId,
  );
});

test("unsupported adapter capability fails before persistence or provider calls", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  adapter.compatibility.operations = ["create", "validate"];
  adapter.compatibility.overlappingRotation = false;
  adapter.compatibility.recovery = false;
  const runtime = engine(store, sink, [adapter]);

  await assert.rejects(
    runtime.run({
      plan,
      operation: "rotate",
      idempotencyKey: "unsupported-operation-0001",
      actor: "automation",
    }),
    (error) =>
      error instanceof IdentityProvisioningEngineError &&
      error.code === "provider-capability-mismatch",
  );
  assert.equal(store.snapshot().length, 0);
  assert.equal(adapter.calls.length, 0);
});

test("interactive authority cannot be disguised as backend API mode", async () => {
  const plan = structuredClone(apiPlanFixture);
  const store = new InMemoryIdentityProvisioningRecordStore();
  const sink = new ReferenceSecretSink();
  const adapter = new ReferenceProviderAdapter(plan);
  adapter.compatibility.authorityGates[0].interactive = true;
  const runtime = engine(store, sink, [adapter]);

  await assert.rejects(
    runtime.run({
      plan,
      operation: "create",
      idempotencyKey: "authority-mode-mismatch-0001",
      actor: "automation",
    }),
    (error) =>
      error instanceof IdentityProvisioningEngineError &&
      error.code === "provider-authority-mode-mismatch",
  );
  assert.equal(store.snapshot().length, 0);
  assert.equal(adapter.calls.length, 0);
});

async function sha256(value) {
  return sha256Bytes(new TextEncoder().encode(value));
}

async function sha256Bytes(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

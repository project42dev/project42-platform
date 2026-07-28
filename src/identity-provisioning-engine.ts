import {
  assessIdentityProvisioningDrift,
  canTransitionIdentityProvisioningState,
  evaluateIdentityProvisioningReadiness,
  validateIdentityProviderCompatibility,
  validateIdentityProvisioningPlan,
  validateIdentityProvisioningRecord,
} from "./identity-provisioning.js";
import type {
  IdentityProvisioningActor,
  IdentityProvisioningAdapter,
  IdentityProvisioningAdapterContext,
  IdentityProvisioningAdapterResult,
  IdentityProvisioningError,
  IdentityProvisioningGateStatus,
  IdentityProvisioningOperation,
  IdentityProvisioningPlan,
  IdentityProvisioningRecord,
  IdentityProvisioningSecretSink,
  IdentityProvisioningState,
} from "./identity-provisioning.js";

export interface IdentityProvisioningRunRequest {
  plan: IdentityProvisioningPlan;
  operation: IdentityProvisioningOperation;
  idempotencyKey: string;
  actor: IdentityProvisioningActor;
}

export interface IdentityProvisioningAuthorityDecisionRequest {
  plan: IdentityProvisioningPlan;
  idempotencyKey: string;
  actor: Exclude<IdentityProvisioningActor, "automation">;
  decision: "approved" | "denied" | "cancelled";
  continuationValue: string;
}

export interface IdentityProvisioningRecordStore {
  getByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<IdentityProvisioningRecord | null>;
  getLatestByClientRef(
    clientRef: string,
  ): Promise<IdentityProvisioningRecord | null>;
  save(
    record: IdentityProvisioningRecord,
    expectedUpdatedAt: string | null,
  ): Promise<void>;
}

export interface IdentityProvisioningEngineOptions {
  store: IdentityProvisioningRecordStore;
  secretSink: IdentityProvisioningSecretSink;
  adapters: readonly IdentityProvisioningAdapter[];
  now?: () => string;
  createId?: (kind: "operation" | "correlation") => string;
}

export class IdentityProvisioningEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IdentityProvisioningEngineError";
    this.code = code;
  }
}

export class InMemoryIdentityProvisioningRecordStore
  implements IdentityProvisioningRecordStore {
  readonly #records = new Map<string, IdentityProvisioningRecord>();

  constructor(initial: readonly IdentityProvisioningRecord[] = []) {
    for (const record of initial) {
      assertValidRecord(record);
      if (this.#records.has(record.idempotencyKey)) {
        throw new IdentityProvisioningEngineError(
          "duplicate-idempotency-key",
          `Duplicate initial idempotency key: ${record.idempotencyKey}`,
        );
      }
      this.#records.set(record.idempotencyKey, clone(record));
    }
  }

  async getByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<IdentityProvisioningRecord | null> {
    const value = this.#records.get(idempotencyKey);
    return value ? clone(value) : null;
  }

  async getLatestByClientRef(
    clientRef: string,
  ): Promise<IdentityProvisioningRecord | null> {
    const candidates = [...this.#records.values()]
      .filter((record) => record.clientRef === clientRef)
      .sort((left, right) => {
        const time = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        if (time !== 0) return time;
        return right.operationId.localeCompare(left.operationId);
      });
    return candidates[0] ? clone(candidates[0]) : null;
  }

  async save(
    record: IdentityProvisioningRecord,
    expectedUpdatedAt: string | null,
  ): Promise<void> {
    assertValidRecord(record);
    const current = this.#records.get(record.idempotencyKey);
    if (!current && expectedUpdatedAt !== null) {
      throw new IdentityProvisioningEngineError(
        "record-concurrency-conflict",
        "Provisioning record was removed or replaced",
      );
    }
    if (current && expectedUpdatedAt === null) {
      throw new IdentityProvisioningEngineError(
        "record-concurrency-conflict",
        "Provisioning record already exists",
      );
    }
    if (current && current.updatedAt !== expectedUpdatedAt) {
      throw new IdentityProvisioningEngineError(
        "record-concurrency-conflict",
        "Provisioning record changed during the operation",
      );
    }
    if (
      current &&
      (current.operationId !== record.operationId ||
        current.planId !== record.planId ||
        current.clientRef !== record.clientRef)
    ) {
      throw new IdentityProvisioningEngineError(
        "idempotency-binding-conflict",
        "An idempotency key cannot be rebound to another operation",
      );
    }
    this.#records.set(record.idempotencyKey, clone(record));
  }

  snapshot(): IdentityProvisioningRecord[] {
    return [...this.#records.values()]
      .map(clone)
      .sort((left, right) =>
        left.idempotencyKey.localeCompare(right.idempotencyKey),
      );
  }
}

export class IdentityProvisioningEngine {
  readonly #store: IdentityProvisioningRecordStore;
  readonly #secretSink: IdentityProvisioningSecretSink;
  readonly #adapters: Map<string, IdentityProvisioningAdapter>;
  readonly #now: () => string;
  readonly #createId: (kind: "operation" | "correlation") => string;

  constructor(options: IdentityProvisioningEngineOptions) {
    this.#store = options.store;
    this.#secretSink = options.secretSink;
    this.#adapters = new Map(
      options.adapters.map((adapter) => [
        adapter.compatibility.provider,
        adapter,
      ]),
    );
    if (this.#adapters.size !== options.adapters.length) {
      throw new IdentityProvisioningEngineError(
        "duplicate-provider-adapter",
        "Only one adapter may be registered for a provider",
      );
    }
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#createId =
      options.createId ??
      ((kind) => `${kind}-${crypto.randomUUID()}`);
  }

  async run(
    request: IdentityProvisioningRunRequest,
  ): Promise<IdentityProvisioningRecord> {
    const adapter = this.#preflight(
      request.plan,
      request.operation,
    );
    const existing = await this.#store.getByIdempotencyKey(
      request.idempotencyKey,
    );
    if (existing) {
      this.#assertIdempotencyBinding(existing, request);
      if (
        existing.state === "ready" ||
        existing.state === "disabled" ||
        existing.state === "retired" ||
        existing.state === "awaiting-authority" ||
        (existing.state === "failed" && !existing.error?.retryable)
      ) {
        return existing;
      }
      if (existing.state === "failed" && existing.error?.retryable) {
        const recovering = {
          ...this.#transition(
            existing,
            "recovering",
            request.actor,
            "operation-recovery-started",
            "retrying-failed-operation",
          ),
          attempt: existing.attempt + 1,
        };
        await this.#store.save(recovering, existing.updatedAt);
        return this.#executeAdapter(
          request.plan,
          adapter,
          recovering,
          request.actor,
        );
      }
      return this.#executeAdapter(
        request.plan,
        adapter,
        existing,
        request.actor,
      );
    }

    const previous = await this.#store.getLatestByClientRef(
      request.plan.client.clientRef,
    );
    if (
      request.operation === "create" &&
      previous &&
      previous.state !== "retired"
    ) {
      return this.#recordPreflightFailure(
        request,
        "client-already-provisioned",
        "A different idempotency key cannot create a second provider client.",
      );
    }

    const startedAt = this.#timestamp();
    const operationId = this.#createId("operation");
    const record: IdentityProvisioningRecord = {
      schemaVersion: "1.0",
      operationId,
      planId: request.plan.planId,
      clientRef: request.plan.client.clientRef,
      idempotencyKey: request.idempotencyKey,
      operation: request.operation,
      state: "preflight",
      attempt: 1,
      startedAt,
      updatedAt: startedAt,
      continuation: null,
      secret:
        request.operation === "create" ? null : previous?.secret ?? null,
      observation: null,
      drift: [],
      audit: [
        {
          sequence: 1,
          occurredAt: startedAt,
          eventType: "operation-started",
          actor: request.actor,
          result: "started",
          correlationId: this.#createId("correlation"),
          detailCode: `${request.operation}-requested`,
        },
      ],
      rollback: {
        allowed: false,
        restoreState: null,
        reasonCode: "preflight-not-complete",
        snapshotDigest: null,
      },
      error: null,
    };
    await this.#store.save(record, null);
    return this.#executeAdapter(
      request.plan,
      adapter,
      record,
      request.actor,
      previous,
    );
  }

  async decideAuthority(
    request: IdentityProvisioningAuthorityDecisionRequest,
  ): Promise<IdentityProvisioningRecord> {
    const record = await this.#store.getByIdempotencyKey(
      request.idempotencyKey,
    );
    if (!record) {
      throw new IdentityProvisioningEngineError(
        "operation-not-found",
        "The authority-gated operation does not exist",
      );
    }
    if (
      record.planId !== request.plan.planId ||
      record.clientRef !== request.plan.client.clientRef
    ) {
      throw new IdentityProvisioningEngineError(
        "idempotency-binding-conflict",
        "The authority decision does not belong to this plan and client",
      );
    }
    if (record.state !== "awaiting-authority" || !record.continuation) {
      if (
        record.continuation?.status === request.decision &&
        ["ready", "failed"].includes(record.state)
      ) {
        return record;
      }
      throw new IdentityProvisioningEngineError(
        "authority-gate-not-pending",
        "The operation has no pending authority gate",
      );
    }
    if (record.continuation.requiredAuthority !== request.actor) {
      const denied = this.#appendAudit(
        record,
        request.actor,
        "authority-decision-rejected",
        "failed",
        "wrong-authority-class",
      );
      await this.#store.save(denied, record.updatedAt);
      throw new IdentityProvisioningEngineError(
        "wrong-authority-class",
        "The actor does not hold the required provider authority",
      );
    }
    const proofDigest = await sha256(request.continuationValue);
    if (!constantTimeEqual(
      proofDigest,
      record.continuation.continuationDigest,
    )) {
      const denied = this.#appendAudit(
        record,
        request.actor,
        "authority-decision-rejected",
        "failed",
        "continuation-proof-invalid",
      );
      await this.#store.save(denied, record.updatedAt);
      throw new IdentityProvisioningEngineError(
        "continuation-proof-invalid",
        "The authority continuation proof is invalid",
      );
    }

    const now = this.#timestamp();
    const expired =
      Date.parse(now) >= Date.parse(record.continuation.expiresAt);
    const status: IdentityProvisioningGateStatus = expired
      ? "expired"
      : request.decision;
    const decided: IdentityProvisioningRecord = {
      ...record,
      updatedAt: now,
      continuation: {
        ...record.continuation,
        status,
      },
    };
    if (status !== "approved") {
      decided.state = "failed";
      decided.error = gateError(status);
      decided.rollback = {
        allowed: false,
        restoreState: null,
        reasonCode: "no-provider-write",
        snapshotDigest: null,
      };
      const failed = this.#appendAuditAt(
        decided,
        now,
        request.actor,
        "authority-gate-completed",
        status === "cancelled" ? "cancelled" : "failed",
        `authority-${status}`,
      );
      await this.#store.save(failed, record.updatedAt);
      return failed;
    }

    const provisioning = this.#transitionAt(
      decided,
      "provisioning",
      now,
      request.actor,
      "authority-gate-completed",
      "authority-approved",
    );
    await this.#store.save(provisioning, record.updatedAt);
    const adapter = this.#preflight(
      request.plan,
      record.operation,
    );
    return this.#executeAdapter(
      request.plan,
      adapter,
      provisioning,
      request.actor,
    );
  }

  #preflight(
    plan: IdentityProvisioningPlan,
    operation: IdentityProvisioningOperation,
  ): IdentityProvisioningAdapter {
    const planValidation = validateIdentityProvisioningPlan(plan);
    if (!planValidation.valid) {
      throw new IdentityProvisioningEngineError(
        "invalid-provisioning-plan",
        planValidation.errors.join("; "),
      );
    }
    const adapter = this.#adapters.get(plan.provider.id);
    if (!adapter) {
      throw new IdentityProvisioningEngineError(
        "provider-adapter-not-found",
        `No adapter is registered for provider ${plan.provider.id}`,
      );
    }
    const compatibilityValidation = validateIdentityProviderCompatibility(
      adapter.compatibility,
    );
    if (!compatibilityValidation.valid) {
      throw new IdentityProvisioningEngineError(
        "invalid-provider-compatibility",
        compatibilityValidation.errors.join("; "),
      );
    }
    if (
      adapter.compatibility.adapterVersion !== plan.provider.adapterVersion ||
      !adapter.compatibility.modes.includes(plan.provider.mode) ||
      !adapter.compatibility.operations.includes(operation) ||
      !adapter.compatibility.clientKinds.includes(plan.client.clientKind)
    ) {
      throw new IdentityProvisioningEngineError(
        "provider-capability-mismatch",
        "The adapter does not declare this plan mode, operation, client kind, or version",
      );
    }
    const operationGates = adapter.compatibility.authorityGates.filter(
      (gate) => gate.operation === operation,
    );
    if (
      operationGates.some(
        (gate) =>
          gate.requiredAuthority !==
          plan.provider.authorityBoundary.kind,
      )
    ) {
      throw new IdentityProvisioningEngineError(
        "provider-authority-mismatch",
        "The plan authority boundary does not match the provider gate",
      );
    }
    const interactiveGate = operationGates.some((gate) => gate.interactive);
    if (
      interactiveGate !==
      (plan.provider.mode === "resumable-owner-gate")
    ) {
      throw new IdentityProvisioningEngineError(
        "provider-authority-mode-mismatch",
        "Interactive provider authority must use resumable-owner-gate mode",
      );
    }
    return adapter;
  }

  async #executeAdapter(
    plan: IdentityProvisioningPlan,
    adapter: IdentityProvisioningAdapter,
    record: IdentityProvisioningRecord,
    actor: IdentityProvisioningActor,
    previous: IdentityProvisioningRecord | null = record,
  ): Promise<IdentityProvisioningRecord> {
    let current = record;
    if (
      current.state === "preflight" &&
      plan.provider.mode !== "resumable-owner-gate"
    ) {
      current = this.#transition(
        current,
        "provisioning",
        actor,
        "preflight-completed",
        "provider-write-authorized",
      );
      await this.#store.save(current, record.updatedAt);
    }
    const context: IdentityProvisioningAdapterContext = {
      idempotencyKey: current.idempotencyKey,
      now: this.#timestamp(),
      secretSink: this.#secretSink,
    };
    let result: IdentityProvisioningAdapterResult;
    try {
      result = await adapter.execute(
        current.operation,
        plan,
        previous,
        context,
      );
    } catch (error) {
      const failed = this.#fail(
        current,
        actor,
        "adapter-execution-failed",
        "The provider operation failed. Review the provider and retry safely.",
        true,
        error instanceof Error ? error.name : "provider-error",
      );
      await this.#store.save(failed, current.updatedAt);
      return failed;
    }
    return this.#applyAdapterResult(plan, current, result, actor);
  }

  async #applyAdapterResult(
    plan: IdentityProvisioningPlan,
    record: IdentityProvisioningRecord,
    result: IdentityProvisioningAdapterResult,
    actor: IdentityProvisioningActor,
  ): Promise<IdentityProvisioningRecord> {
    const now = this.#timestamp();
    if (!canTransitionIdentityProvisioningState(record.state, result.nextState)) {
      const failed = this.#failAt(
        record,
        now,
        actor,
        "adapter-transition-invalid",
        "The provider adapter returned an invalid lifecycle transition.",
        false,
        "invalid-adapter-result",
      );
      await this.#store.save(failed, record.updatedAt);
      return failed;
    }

    let next: IdentityProvisioningRecord = {
      ...record,
      state: result.nextState,
      updatedAt: now,
      continuation:
        result.continuation ??
        (record.continuation?.status === "approved"
          ? record.continuation
          : null),
      secret: result.secret ?? record.secret,
      observation: result.observation,
      drift: [],
      rollback: result.rollback,
      error: result.error,
    };
    next = this.#appendAuditAt(
      next,
      now,
      "automation",
      "adapter-operation-completed",
      result.error ? "failed" : "succeeded",
      result.detailCode,
    );

    if (next.state === "awaiting-authority") {
      const validation = validateIdentityProvisioningRecord(next);
      if (!validation.valid) {
        next = this.#failAt(
          record,
          now,
          actor,
          "adapter-result-invalid",
          "The provider authority gate was invalid.",
          false,
          "invalid-adapter-result",
        );
      }
      await this.#store.save(next, record.updatedAt);
      return next;
    }

    if (next.state === "failed" || next.state === "recovering") {
      if (!next.error) {
        next.error = {
          code: "provider-operation-failed",
          retryable: next.state === "recovering",
          retryAfter: null,
          publicMessage:
            "The provider operation did not complete. Review evidence before retrying.",
        };
      }
      await this.#saveValidatedOrFail(record, next, actor);
      return (await this.#store.getByIdempotencyKey(record.idempotencyKey))!;
    }

    if (
      next.state === "validating" &&
      next.observation &&
      !["disable", "retire"].includes(next.operation)
    ) {
      next.drift = assessIdentityProvisioningDrift(plan, next.observation);
      const candidate: IdentityProvisioningRecord = {
        ...next,
        state: "ready",
      };
      const readiness = evaluateIdentityProvisioningReadiness(plan, candidate);
      if (readiness.ready) {
        next = this.#transitionAt(
          next,
          "ready",
          now,
          "automation",
          "post-registration-validation",
          "client-ready",
        );
      } else {
        next = this.#failAt(
          next,
          now,
          "automation",
          "post-registration-validation-failed",
          "Provider configuration failed readiness validation.",
          true,
          readiness.blockers.join("|").slice(0, 120) ||
            "readiness-blocked",
        );
      }
    }

    await this.#saveValidatedOrFail(record, next, actor);
    return (await this.#store.getByIdempotencyKey(record.idempotencyKey))!;
  }

  async #saveValidatedOrFail(
    previous: IdentityProvisioningRecord,
    next: IdentityProvisioningRecord,
    actor: IdentityProvisioningActor,
  ): Promise<void> {
    const validation = validateIdentityProvisioningRecord(next);
    if (validation.valid) {
      await this.#store.save(next, previous.updatedAt);
      return;
    }
    const failed = this.#failAt(
      previous,
      this.#timestamp(),
      actor,
      "adapter-result-invalid",
      "The provider adapter returned an invalid persisted result.",
      false,
      "invalid-adapter-result",
    );
    await this.#store.save(failed, previous.updatedAt);
  }

  async #recordPreflightFailure(
    request: IdentityProvisioningRunRequest,
    code: string,
    publicMessage: string,
  ): Promise<IdentityProvisioningRecord> {
    const now = this.#timestamp();
    const record: IdentityProvisioningRecord = {
      schemaVersion: "1.0",
      operationId: this.#createId("operation"),
      planId: request.plan.planId,
      clientRef: request.plan.client.clientRef,
      idempotencyKey: request.idempotencyKey,
      operation: request.operation,
      state: "failed",
      attempt: 1,
      startedAt: now,
      updatedAt: now,
      continuation: null,
      secret: null,
      observation: null,
      drift: [],
      audit: [
        {
          sequence: 1,
          occurredAt: now,
          eventType: "preflight-failed",
          actor: request.actor,
          result: "failed",
          correlationId: this.#createId("correlation"),
          detailCode: code,
        },
      ],
      rollback: {
        allowed: false,
        restoreState: null,
        reasonCode: "no-provider-write",
        snapshotDigest: null,
      },
      error: {
        code,
        retryable: false,
        retryAfter: null,
        publicMessage,
      },
    };
    await this.#store.save(record, null);
    return record;
  }

  #assertIdempotencyBinding(
    existing: IdentityProvisioningRecord,
    request: IdentityProvisioningRunRequest,
  ): void {
    if (
      existing.planId !== request.plan.planId ||
      existing.clientRef !== request.plan.client.clientRef ||
      existing.operation !== request.operation
    ) {
      throw new IdentityProvisioningEngineError(
        "idempotency-binding-conflict",
        "The idempotency key is already bound to another plan, client, or operation",
      );
    }
  }

  #transition(
    record: IdentityProvisioningRecord,
    state: IdentityProvisioningState,
    actor: IdentityProvisioningActor,
    eventType: string,
    detailCode: string,
  ): IdentityProvisioningRecord {
    return this.#transitionAt(
      record,
      state,
      this.#timestamp(),
      actor,
      eventType,
      detailCode,
    );
  }

  #transitionAt(
    record: IdentityProvisioningRecord,
    state: IdentityProvisioningState,
    at: string,
    actor: IdentityProvisioningActor,
    eventType: string,
    detailCode: string,
  ): IdentityProvisioningRecord {
    if (!canTransitionIdentityProvisioningState(record.state, state)) {
      throw new IdentityProvisioningEngineError(
        "invalid-state-transition",
        `Cannot transition identity provisioning from ${record.state} to ${state}`,
      );
    }
    return this.#appendAuditAt(
      {
        ...record,
        state,
        updatedAt: at,
        error: state === "failed" || state === "recovering"
          ? record.error
          : null,
      },
      at,
      actor,
      eventType,
      "succeeded",
      detailCode,
    );
  }

  #fail(
    record: IdentityProvisioningRecord,
    actor: IdentityProvisioningActor,
    code: string,
    publicMessage: string,
    retryable: boolean,
    detailCode: string,
  ): IdentityProvisioningRecord {
    return this.#failAt(
      record,
      this.#timestamp(),
      actor,
      code,
      publicMessage,
      retryable,
      detailCode,
    );
  }

  #failAt(
    record: IdentityProvisioningRecord,
    at: string,
    actor: IdentityProvisioningActor,
    code: string,
    publicMessage: string,
    retryable: boolean,
    detailCode: string,
  ): IdentityProvisioningRecord {
    const error: IdentityProvisioningError = {
      code,
      retryable,
      retryAfter: null,
      publicMessage,
    };
    return this.#appendAuditAt(
      {
        ...record,
        state: "failed",
        updatedAt: at,
        error,
      },
      at,
      actor,
      code,
      "failed",
      normalizeDetailCode(detailCode),
    );
  }

  #appendAudit(
    record: IdentityProvisioningRecord,
    actor: IdentityProvisioningActor,
    eventType: string,
    result: "started" | "succeeded" | "failed" | "cancelled",
    detailCode: string,
  ): IdentityProvisioningRecord {
    return this.#appendAuditAt(
      record,
      this.#timestamp(),
      actor,
      eventType,
      result,
      detailCode,
    );
  }

  #appendAuditAt(
    record: IdentityProvisioningRecord,
    at: string,
    actor: IdentityProvisioningActor,
    eventType: string,
    result: "started" | "succeeded" | "failed" | "cancelled",
    detailCode: string,
  ): IdentityProvisioningRecord {
    return {
      ...record,
      updatedAt: at,
      audit: [
        ...record.audit,
        {
          sequence: record.audit.length + 1,
          occurredAt: at,
          eventType: normalizeDetailCode(eventType),
          actor,
          result,
          correlationId: record.audit[0]?.correlationId ??
            this.#createId("correlation"),
          detailCode: normalizeDetailCode(detailCode),
        },
      ],
    };
  }

  #timestamp(): string {
    const value = this.#now();
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
      Number.isNaN(Date.parse(value))
    ) {
      throw new IdentityProvisioningEngineError(
        "invalid-clock",
        "Identity provisioning clock must return an ISO 8601 UTC timestamp",
      );
    }
    return value;
  }
}

function gateError(
  status: Exclude<IdentityProvisioningGateStatus, "pending" | "approved">,
): IdentityProvisioningError {
  if (status === "expired") {
    return {
      code: "authority-gate-expired",
      retryable: true,
      retryAfter: null,
      publicMessage:
        "The provider confirmation expired. Restart the bounded owner step.",
    };
  }
  return {
    code:
      status === "denied"
        ? "authority-gate-denied"
        : "authority-gate-cancelled",
    retryable: status === "cancelled",
    retryAfter: null,
    publicMessage:
      status === "denied"
        ? "The required provider authority denied the operation."
        : "The provider confirmation was cancelled and can be restarted.",
  };
}

function assertValidRecord(record: IdentityProvisioningRecord): void {
  const validation = validateIdentityProvisioningRecord(record);
  if (!validation.valid) {
    throw new IdentityProvisioningEngineError(
      "invalid-provisioning-record",
      validation.errors.join("; "),
    );
  }
}

function normalizeDetailCode(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
  return /^[a-z][a-z0-9-]{1,127}$/.test(normalized)
    ? normalized
    : "operation-detail";
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

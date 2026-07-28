import type { ValidationResult } from "./schema.js";

export const IDENTITY_PROVISIONING_CONTRACT_VERSION = "1.0" as const;

export const IDENTITY_PROVISIONING_MODES = [
  "api",
  "resumable-owner-gate",
  "preconfigured",
] as const;

export const IDENTITY_PROVISIONING_OPERATIONS = [
  "create",
  "validate",
  "observe",
  "reconcile",
  "rotate",
  "recover",
  "disable",
  "retire",
] as const;

export const IDENTITY_PROVISIONING_STATES = [
  "planned",
  "preflight",
  "awaiting-authority",
  "provisioning",
  "secret-pending",
  "validating",
  "ready",
  "rotating",
  "disabled",
  "failed",
  "recovering",
  "retired",
] as const;

export const IDENTITY_PROVISIONING_CLIENT_KINDS = [
  "browser-public",
  "api-confidential",
  "identity-link-confidential",
] as const;

export const IDENTITY_PROVISIONING_AUTHORITIES = [
  "deployment-owner",
  "tenant-admin",
  "organization-admin",
  "provider-account-holder",
  "operator",
] as const;

export const IDENTITY_PROVISIONING_ACTORS = [
  "automation",
  ...IDENTITY_PROVISIONING_AUTHORITIES,
] as const;

export type IdentityProvisioningMode =
  (typeof IDENTITY_PROVISIONING_MODES)[number];
export type IdentityProvisioningOperation =
  (typeof IDENTITY_PROVISIONING_OPERATIONS)[number];
export type IdentityProvisioningState =
  (typeof IDENTITY_PROVISIONING_STATES)[number];
export type IdentityProvisioningClientKind =
  (typeof IDENTITY_PROVISIONING_CLIENT_KINDS)[number];
export type IdentityProvisioningAuthority =
  (typeof IDENTITY_PROVISIONING_AUTHORITIES)[number];
export type IdentityProvisioningActor =
  (typeof IDENTITY_PROVISIONING_ACTORS)[number];

export interface IdentityProvisioningAuthorityBoundary {
  kind: IdentityProvisioningAuthority;
  referenceDigest: string;
}

export interface IdentityProvisioningProvider {
  id: string;
  adapterVersion: string;
  mode: IdentityProvisioningMode;
  issuer: string;
  authorityBoundary: IdentityProvisioningAuthorityBoundary;
  capabilities: IdentityProvisioningOperation[];
}

export interface IdentityProvisioningClient {
  clientRef: string;
  clientKind: IdentityProvisioningClientKind;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedOrigins: string[];
  grantTypes: ["authorization_code"];
  tokenEndpointAuthMethod:
    | "none"
    | "client_secret_basic"
    | "client_secret_post"
    | "private_key_jwt";
  pkceRequired: boolean;
  scopes: string[];
  permissions: string[];
}

export interface IdentityProvisioningSecretPolicy {
  required: boolean;
  secretManagerRef: string;
  rotationIntervalDays: number | null;
  overlapRequired: boolean;
}

export interface IdentityProvisioningPlan {
  schemaVersion: typeof IDENTITY_PROVISIONING_CONTRACT_VERSION;
  planId: string;
  installationRef: string;
  createdAt: string;
  desiredStateDigest: string;
  provider: IdentityProvisioningProvider;
  client: IdentityProvisioningClient;
  secretPolicy: IdentityProvisioningSecretPolicy;
}

export type IdentityProvisioningGateStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled";

export interface IdentityProvisioningContinuation {
  gateId: string;
  requiredAuthority: IdentityProvisioningAuthority;
  reasonCode: string;
  continuationDigest: string;
  providerActionUrl: string;
  expiresAt: string;
  status: IdentityProvisioningGateStatus;
}

export type IdentityProvisioningSecretStatus =
  | "pending"
  | "active"
  | "retiring"
  | "revoked";

export interface IdentityProvisioningSecretReference {
  secretManagerRef: string;
  secretRef: string;
  versionRef: string;
  valueDigest: string;
  status: IdentityProvisioningSecretStatus;
  createdAt: string;
  expiresAt: string | null;
}

export interface IdentityProvisioningObservation {
  observedAt: string;
  providerClientRefDigest: string;
  observedStateDigest: string;
  ownershipVerified: boolean;
  issuerVerified: boolean;
  callbacksVerified: boolean;
  permissionsVerified: boolean;
  credentialVerified: boolean;
  clientEnabled: boolean;
}

export type IdentityProvisioningDriftSeverity =
  | "informational"
  | "operational"
  | "security";

export interface IdentityProvisioningDrift {
  code:
    | "state-digest-mismatch"
    | "ownership-unverified"
    | "issuer-mismatch"
    | "callback-mismatch"
    | "permission-mismatch"
    | "credential-unusable"
    | "client-disabled";
  severity: IdentityProvisioningDriftSeverity;
  securityCritical: boolean;
  path: string;
}

export interface IdentityProvisioningAuditEvent {
  sequence: number;
  occurredAt: string;
  eventType: string;
  actor: IdentityProvisioningActor;
  result: "started" | "succeeded" | "failed" | "cancelled";
  correlationId: string;
  detailCode: string;
}

export interface IdentityProvisioningRollback {
  allowed: boolean;
  restoreState: IdentityProvisioningState | null;
  reasonCode: string;
  snapshotDigest: string | null;
}

export interface IdentityProvisioningError {
  code: string;
  retryable: boolean;
  retryAfter: string | null;
  publicMessage: string;
}

export interface IdentityProvisioningRecord {
  schemaVersion: typeof IDENTITY_PROVISIONING_CONTRACT_VERSION;
  operationId: string;
  planId: string;
  clientRef: string;
  idempotencyKey: string;
  operation: IdentityProvisioningOperation;
  state: IdentityProvisioningState;
  attempt: number;
  startedAt: string;
  updatedAt: string;
  continuation: IdentityProvisioningContinuation | null;
  secret: IdentityProvisioningSecretReference | null;
  observation: IdentityProvisioningObservation | null;
  drift: IdentityProvisioningDrift[];
  audit: IdentityProvisioningAuditEvent[];
  rollback: IdentityProvisioningRollback;
  error: IdentityProvisioningError | null;
}

export interface IdentityProvisioningAuthorityGate {
  operation: IdentityProvisioningOperation;
  requiredAuthority: IdentityProvisioningAuthority;
  interactive: boolean;
  reasonCode: string;
}

export interface IdentityProviderCompatibility {
  schemaVersion: typeof IDENTITY_PROVISIONING_CONTRACT_VERSION;
  provider: string;
  adapterVersion: string;
  evidenceReviewedAt: string;
  evidenceSources: string[];
  modes: IdentityProvisioningMode[];
  operations: IdentityProvisioningOperation[];
  clientKinds: IdentityProvisioningClientKind[];
  authorityGates: IdentityProvisioningAuthorityGate[];
  secretKinds: Array<"none" | "client-secret" | "private-key">;
  overlappingRotation: boolean;
  registrationManagement: boolean;
  recovery: boolean;
}

export interface IdentityProvisioningReadiness {
  ready: boolean;
  blockers: string[];
}

export type IdentityProvisioningSecretKind =
  | "client-secret"
  | "private-key";

export interface IdentityProvisioningSecretMaterial {
  kind: IdentityProvisioningSecretKind;
  value: Uint8Array;
  expiresAt: string | null;
}

export interface IdentityProvisioningSecretStoreRequest {
  operationId: string;
  clientRef: string;
  secretManagerRef: string;
  material: IdentityProvisioningSecretMaterial;
}

export interface IdentityProvisioningSecretSink {
  store(
    request: IdentityProvisioningSecretStoreRequest,
  ): Promise<IdentityProvisioningSecretReference>;
  revoke(reference: IdentityProvisioningSecretReference): Promise<void>;
}

export interface IdentityProvisioningAdapterContext {
  idempotencyKey: string;
  now: string;
  secretSink: IdentityProvisioningSecretSink;
}

export interface IdentityProvisioningAdapterResult {
  nextState: IdentityProvisioningState;
  continuation: IdentityProvisioningContinuation | null;
  secret: IdentityProvisioningSecretReference | null;
  observation: IdentityProvisioningObservation | null;
  rollback: IdentityProvisioningRollback;
  error: IdentityProvisioningError | null;
  detailCode: string;
}

export interface IdentityProvisioningAdapter {
  readonly compatibility: IdentityProviderCompatibility;
  execute(
    operation: IdentityProvisioningOperation,
    plan: IdentityProvisioningPlan,
    previous: IdentityProvisioningRecord | null,
    context: IdentityProvisioningAdapterContext,
  ): Promise<IdentityProvisioningAdapterResult>;
}

const stableIdPattern = /^[a-z0-9][a-z0-9._:-]{2,255}$/i;
const versionPattern = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
const digestPattern = /^[a-f0-9]{64}$/;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/;
const safeCodePattern = /^[a-z][a-z0-9-]{1,127}$/;
const forbiddenCredentialKeys = new Set([
  "accesstoken",
  "clientsecret",
  "credentialvalue",
  "password",
  "privatekey",
  "refreshtoken",
  "secrettext",
  "secretvalue",
  "webhooksecret",
]);

const transitions: Readonly<
  Record<IdentityProvisioningState, readonly IdentityProvisioningState[]>
> = {
  planned: ["preflight", "retired"],
  preflight: [
    "awaiting-authority",
    "provisioning",
    "validating",
    "failed",
    "retired",
  ],
  "awaiting-authority": ["provisioning", "failed", "retired"],
  provisioning: [
    "secret-pending",
    "validating",
    "disabled",
    "failed",
    "recovering",
    "retired",
  ],
  "secret-pending": ["validating", "failed", "recovering"],
  validating: ["ready", "disabled", "failed", "recovering"],
  ready: ["validating", "rotating", "disabled", "failed", "retired"],
  rotating: ["validating", "ready", "failed", "recovering"],
  disabled: ["validating", "ready", "recovering", "retired"],
  failed: ["preflight", "recovering", "retired"],
  recovering: ["preflight", "validating", "ready", "failed", "retired"],
  retired: [],
};

export function canTransitionIdentityProvisioningState(
  from: IdentityProvisioningState,
  to: IdentityProvisioningState,
): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function assessIdentityProvisioningDrift(
  plan: IdentityProvisioningPlan,
  observation: IdentityProvisioningObservation,
): IdentityProvisioningDrift[] {
  const drift: IdentityProvisioningDrift[] = [];
  if (plan.desiredStateDigest !== observation.observedStateDigest) {
    drift.push({
      code: "state-digest-mismatch",
      severity: "operational",
      securityCritical: false,
      path: "/desiredStateDigest",
    });
  }
  addVerificationDrift(
    drift,
    observation.ownershipVerified,
    "ownership-unverified",
    "/provider/authorityBoundary",
  );
  addVerificationDrift(
    drift,
    observation.issuerVerified,
    "issuer-mismatch",
    "/provider/issuer",
  );
  addVerificationDrift(
    drift,
    observation.callbacksVerified,
    "callback-mismatch",
    "/client/redirectUris",
  );
  addVerificationDrift(
    drift,
    observation.permissionsVerified,
    "permission-mismatch",
    "/client/permissions",
  );
  addVerificationDrift(
    drift,
    observation.credentialVerified,
    "credential-unusable",
    "/secretPolicy",
  );
  if (!observation.clientEnabled) {
    drift.push({
      code: "client-disabled",
      severity: "operational",
      securityCritical: false,
      path: "/provider/clientEnabled",
    });
  }
  return drift;
}

export function evaluateIdentityProvisioningReadiness(
  plan: IdentityProvisioningPlan,
  record: IdentityProvisioningRecord,
): IdentityProvisioningReadiness {
  const blockers: string[] = [];
  if (record.planId !== plan.planId || record.clientRef !== plan.client.clientRef) {
    blockers.push("record does not belong to the plan and client");
  }
  if (record.state !== "ready") blockers.push("provisioning state is not ready");
  if (record.error) blockers.push(`operation error: ${record.error.code}`);
  if (!record.observation) {
    blockers.push("post-registration observation is missing");
  } else {
    const observedDrift = assessIdentityProvisioningDrift(
      plan,
      record.observation,
    );
    if (observedDrift.length > 0) {
      blockers.push(
        ...observedDrift.map((finding) => `drift: ${finding.code}`),
      );
    }
  }
  if (
    record.continuation &&
    record.continuation.status !== "approved"
  ) {
    blockers.push(
      `authority gate is ${record.continuation.status}`,
    );
  }
  if (
    plan.secretPolicy.required &&
    (!record.secret || record.secret.status !== "active")
  ) {
    blockers.push("active secret reference is missing");
  }
  if (record.drift.some((finding) => finding.securityCritical)) {
    blockers.push("security-critical drift is unresolved");
  }
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
}

export function validateIdentityProvisioningPlan(
  value: IdentityProvisioningPlan,
): ValidationResult {
  const errors: string[] = [];
  rejectForbiddenCredentialFields(value, errors);
  rejectUnknownKeys(
    value,
    [
      "schemaVersion",
      "planId",
      "installationRef",
      "createdAt",
      "desiredStateDigest",
      "provider",
      "client",
      "secretPolicy",
    ],
    "plan",
    errors,
  );
  validateVersion(value.schemaVersion, errors);
  validateStableId(value.planId, "plan ID", errors);
  validateStableId(value.installationRef, "installation reference", errors);
  validateTimestamp(value.createdAt, "plan createdAt", errors);
  validateDigest(value.desiredStateDigest, "desired state digest", errors);

  rejectUnknownKeys(
    value.provider,
    [
      "id",
      "adapterVersion",
      "mode",
      "issuer",
      "authorityBoundary",
      "capabilities",
    ],
    "provider",
    errors,
  );
  validateStableId(value.provider.id, "provider ID", errors);
  if (!versionPattern.test(value.provider.adapterVersion)) {
    errors.push("provider adapter version is invalid");
  }
  if (!IDENTITY_PROVISIONING_MODES.includes(value.provider.mode)) {
    errors.push("provider mode is unsupported");
  }
  validateHttpsUrl(
    value.provider.issuer,
    "provider issuer",
    errors,
    true,
  );
  rejectUnknownKeys(
    value.provider.authorityBoundary,
    ["kind", "referenceDigest"],
    "authority boundary",
    errors,
  );
  if (
    !IDENTITY_PROVISIONING_AUTHORITIES.includes(
      value.provider.authorityBoundary.kind,
    )
  ) {
    errors.push("authority boundary kind is unsupported");
  }
  validateDigest(
    value.provider.authorityBoundary.referenceDigest,
    "authority boundary reference digest",
    errors,
  );
  validateUniqueEnum(
    value.provider.capabilities,
    IDENTITY_PROVISIONING_OPERATIONS,
    "provider capability",
    errors,
  );
  if (!value.provider.capabilities.includes("validate")) {
    errors.push("provider must support validation");
  }

  validateClient(value.client, errors);
  validateSecretPolicy(value.secretPolicy, value.client, errors);
  return { valid: errors.length === 0, errors };
}

export function validateIdentityProvisioningRecord(
  value: IdentityProvisioningRecord,
): ValidationResult {
  const errors: string[] = [];
  rejectForbiddenCredentialFields(value, errors);
  rejectUnknownKeys(
    value,
    [
      "schemaVersion",
      "operationId",
      "planId",
      "clientRef",
      "idempotencyKey",
      "operation",
      "state",
      "attempt",
      "startedAt",
      "updatedAt",
      "continuation",
      "secret",
      "observation",
      "drift",
      "audit",
      "rollback",
      "error",
    ],
    "record",
    errors,
  );
  validateVersion(value.schemaVersion, errors);
  validateStableId(value.operationId, "operation ID", errors);
  validateStableId(value.planId, "record plan ID", errors);
  validateStableId(value.clientRef, "record client reference", errors);
  if (!idempotencyPattern.test(value.idempotencyKey)) {
    errors.push("idempotency key is invalid");
  }
  if (!IDENTITY_PROVISIONING_OPERATIONS.includes(value.operation)) {
    errors.push("record operation is unsupported");
  }
  if (!IDENTITY_PROVISIONING_STATES.includes(value.state)) {
    errors.push("record state is unsupported");
  }
  if (!Number.isInteger(value.attempt) || value.attempt < 1) {
    errors.push("record attempt must be a positive integer");
  }
  validateTimestamp(value.startedAt, "record startedAt", errors);
  validateTimestamp(value.updatedAt, "record updatedAt", errors);
  if (validTimestamp(value.startedAt) && validTimestamp(value.updatedAt)) {
    if (Date.parse(value.updatedAt) < Date.parse(value.startedAt)) {
      errors.push("record updatedAt cannot precede startedAt");
    }
  }
  validateContinuation(value.continuation, value.state, errors);
  validateSecretReference(value.secret, errors);
  validateObservation(value.observation, errors);
  validateDrift(value.drift, errors);
  validateAudit(value.audit, errors);
  validateRollback(value.rollback, errors);
  validateError(value.error, value.state, errors);
  if (value.state === "ready" && !value.observation) {
    errors.push("ready records require a post-registration observation");
  }
  if (value.state === "awaiting-authority" && !value.continuation) {
    errors.push("awaiting-authority records require a continuation");
  }
  if (value.state === "failed" && !value.error) {
    errors.push("failed records require a typed error");
  }
  if (value.state === "retired" && value.secret?.status !== "revoked") {
    errors.push("retired records cannot retain an unrevoked secret reference");
  }
  return { valid: errors.length === 0, errors };
}

export function validateIdentityProviderCompatibility(
  value: IdentityProviderCompatibility,
): ValidationResult {
  const errors: string[] = [];
  rejectForbiddenCredentialFields(value, errors);
  rejectUnknownKeys(
    value,
    [
      "schemaVersion",
      "provider",
      "adapterVersion",
      "evidenceReviewedAt",
      "evidenceSources",
      "modes",
      "operations",
      "clientKinds",
      "authorityGates",
      "secretKinds",
      "overlappingRotation",
      "registrationManagement",
      "recovery",
    ],
    "compatibility",
    errors,
  );
  validateVersion(value.schemaVersion, errors);
  validateStableId(value.provider, "compatibility provider", errors);
  if (!versionPattern.test(value.adapterVersion)) {
    errors.push("compatibility adapter version is invalid");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.evidenceReviewedAt)) {
    errors.push("evidenceReviewedAt must be an ISO date");
  }
  if (value.evidenceSources.length === 0) {
    errors.push("at least one first-party evidence source is required");
  }
  for (const source of value.evidenceSources) {
    validateHttpsUrl(source, "evidence source", errors);
  }
  validateUniqueEnum(
    value.modes,
    IDENTITY_PROVISIONING_MODES,
    "compatibility mode",
    errors,
  );
  validateUniqueEnum(
    value.operations,
    IDENTITY_PROVISIONING_OPERATIONS,
    "compatibility operation",
    errors,
  );
  validateUniqueEnum(
    value.clientKinds,
    IDENTITY_PROVISIONING_CLIENT_KINDS,
    "compatibility client kind",
    errors,
  );
  if (!value.operations.includes("validate")) {
    errors.push("compatibility must support validation");
  }
  const gateKeys = new Set<string>();
  for (const gate of value.authorityGates) {
    rejectUnknownKeys(
      gate,
      ["operation", "requiredAuthority", "interactive", "reasonCode"],
      "authority gate",
      errors,
    );
    if (!IDENTITY_PROVISIONING_OPERATIONS.includes(gate.operation)) {
      errors.push("authority gate operation is unsupported");
    }
    if (!IDENTITY_PROVISIONING_AUTHORITIES.includes(gate.requiredAuthority)) {
      errors.push("authority gate role is unsupported");
    }
    if (!safeCodePattern.test(gate.reasonCode)) {
      errors.push("authority gate reason code is invalid");
    }
    const key = `${gate.operation}:${gate.requiredAuthority}`;
    if (gateKeys.has(key)) errors.push(`duplicate authority gate: ${key}`);
    gateKeys.add(key);
  }
  const allowedSecretKinds = ["none", "client-secret", "private-key"] as const;
  validateUniqueEnum(
    value.secretKinds,
    allowedSecretKinds,
    "secret kind",
    errors,
  );
  if (
    value.overlappingRotation &&
    !value.operations.includes("rotate")
  ) {
    errors.push("overlapping rotation requires rotate capability");
  }
  if (value.recovery && !value.operations.includes("recover")) {
    errors.push("recovery support requires recover capability");
  }
  return { valid: errors.length === 0, errors };
}

function validateClient(
  client: IdentityProvisioningClient,
  errors: string[],
): void {
  rejectUnknownKeys(
    client,
    [
      "clientRef",
      "clientKind",
      "redirectUris",
      "postLogoutRedirectUris",
      "allowedOrigins",
      "grantTypes",
      "tokenEndpointAuthMethod",
      "pkceRequired",
      "scopes",
      "permissions",
    ],
    "client",
    errors,
  );
  validateStableId(client.clientRef, "client reference", errors);
  if (!IDENTITY_PROVISIONING_CLIENT_KINDS.includes(client.clientKind)) {
    errors.push("client kind is unsupported");
  }
  validateUniqueUrls(
    client.redirectUris,
    "redirect URI",
    true,
    errors,
    false,
    true,
  );
  validateUniqueUrls(
    client.postLogoutRedirectUris,
    "post-logout redirect URI",
    false,
    errors,
    false,
    true,
  );
  validateUniqueUrls(
    client.allowedOrigins,
    "allowed origin",
    true,
    errors,
    true,
    true,
  );
  if (
    client.grantTypes.length !== 1 ||
    client.grantTypes[0] !== "authorization_code"
  ) {
    errors.push("only the authorization_code grant is supported");
  }
  const authMethods = [
    "none",
    "client_secret_basic",
    "client_secret_post",
    "private_key_jwt",
  ] as const;
  if (!authMethods.includes(client.tokenEndpointAuthMethod)) {
    errors.push("token endpoint authentication method is unsupported");
  }
  if (client.clientKind === "browser-public") {
    if (!client.pkceRequired) {
      errors.push("browser-public clients must require PKCE");
    }
    if (client.tokenEndpointAuthMethod !== "none") {
      errors.push("browser-public clients cannot use a client credential");
    }
  } else if (client.tokenEndpointAuthMethod === "none") {
    errors.push("confidential clients require token endpoint authentication");
  }
  validateUniqueStrings(client.scopes, "scope", errors);
  validateUniqueStrings(client.permissions, "permission", errors);
}

function validateSecretPolicy(
  policy: IdentityProvisioningSecretPolicy,
  client: IdentityProvisioningClient,
  errors: string[],
): void {
  rejectUnknownKeys(
    policy,
    [
      "required",
      "secretManagerRef",
      "rotationIntervalDays",
      "overlapRequired",
    ],
    "secret policy",
    errors,
  );
  validateStableId(policy.secretManagerRef, "secret manager reference", errors);
  if (
    policy.rotationIntervalDays !== null &&
    (!Number.isInteger(policy.rotationIntervalDays) ||
      policy.rotationIntervalDays < 1 ||
      policy.rotationIntervalDays > 3650)
  ) {
    errors.push("secret rotation interval must be 1–3650 days or null");
  }
  const credentialRequired = client.tokenEndpointAuthMethod !== "none";
  if (policy.required !== credentialRequired) {
    errors.push("secret policy must match the client authentication method");
  }
  if (!policy.required) {
    if (policy.rotationIntervalDays !== null || policy.overlapRequired) {
      errors.push("credential-free clients cannot configure secret rotation");
    }
  } else if (policy.rotationIntervalDays === null) {
    errors.push("credentialed clients require a rotation interval");
  }
}

function validateContinuation(
  continuation: IdentityProvisioningContinuation | null,
  state: IdentityProvisioningState,
  errors: string[],
): void {
  if (!continuation) return;
  rejectUnknownKeys(
    continuation,
    [
      "gateId",
      "requiredAuthority",
      "reasonCode",
      "continuationDigest",
      "providerActionUrl",
      "expiresAt",
      "status",
    ],
    "continuation",
    errors,
  );
  validateStableId(continuation.gateId, "gate ID", errors);
  if (
    !IDENTITY_PROVISIONING_AUTHORITIES.includes(
      continuation.requiredAuthority,
    )
  ) {
    errors.push("continuation authority is unsupported");
  }
  if (!safeCodePattern.test(continuation.reasonCode)) {
    errors.push("continuation reason code is invalid");
  }
  validateDigest(
    continuation.continuationDigest,
    "continuation digest",
    errors,
  );
  validateHttpsUrl(
    continuation.providerActionUrl,
    "provider action URL",
    errors,
  );
  validateTimestamp(continuation.expiresAt, "continuation expiresAt", errors);
  const statuses: IdentityProvisioningGateStatus[] = [
    "pending",
    "approved",
    "denied",
    "expired",
    "cancelled",
  ];
  if (!statuses.includes(continuation.status)) {
    errors.push("continuation status is unsupported");
  }
  if (state === "awaiting-authority" && continuation.status !== "pending") {
    errors.push("awaiting-authority requires a pending continuation");
  }
}

function validateSecretReference(
  secret: IdentityProvisioningSecretReference | null,
  errors: string[],
): void {
  if (!secret) return;
  rejectUnknownKeys(
    secret,
    [
      "secretManagerRef",
      "secretRef",
      "versionRef",
      "valueDigest",
      "status",
      "createdAt",
      "expiresAt",
    ],
    "secret reference",
    errors,
  );
  validateStableId(secret.secretManagerRef, "secret manager reference", errors);
  validateStableId(secret.secretRef, "secret reference", errors);
  validateStableId(secret.versionRef, "secret version reference", errors);
  validateDigest(secret.valueDigest, "secret value digest", errors);
  const statuses: IdentityProvisioningSecretStatus[] = [
    "pending",
    "active",
    "retiring",
    "revoked",
  ];
  if (!statuses.includes(secret.status)) {
    errors.push("secret status is unsupported");
  }
  validateTimestamp(secret.createdAt, "secret createdAt", errors);
  if (secret.expiresAt !== null) {
    validateTimestamp(secret.expiresAt, "secret expiresAt", errors);
    if (
      validTimestamp(secret.createdAt) &&
      validTimestamp(secret.expiresAt) &&
      Date.parse(secret.expiresAt) <= Date.parse(secret.createdAt)
    ) {
      errors.push("secret expiresAt must follow createdAt");
    }
  }
}

function validateObservation(
  observation: IdentityProvisioningObservation | null,
  errors: string[],
): void {
  if (!observation) return;
  rejectUnknownKeys(
    observation,
    [
      "observedAt",
      "providerClientRefDigest",
      "observedStateDigest",
      "ownershipVerified",
      "issuerVerified",
      "callbacksVerified",
      "permissionsVerified",
      "credentialVerified",
      "clientEnabled",
    ],
    "observation",
    errors,
  );
  validateTimestamp(observation.observedAt, "observation observedAt", errors);
  validateDigest(
    observation.providerClientRefDigest,
    "provider client reference digest",
    errors,
  );
  validateDigest(
    observation.observedStateDigest,
    "observed state digest",
    errors,
  );
  for (const [name, value] of Object.entries(observation)) {
    if (
      name.endsWith("Verified") || name === "clientEnabled"
    ) {
      if (typeof value !== "boolean") {
        errors.push(`${name} must be boolean`);
      }
    }
  }
}

function validateDrift(
  drift: IdentityProvisioningDrift[],
  errors: string[],
): void {
  const codes = new Set<string>();
  for (const finding of drift) {
    rejectUnknownKeys(
      finding,
      ["code", "severity", "securityCritical", "path"],
      "drift finding",
      errors,
    );
    const allowedCodes: IdentityProvisioningDrift["code"][] = [
      "state-digest-mismatch",
      "ownership-unverified",
      "issuer-mismatch",
      "callback-mismatch",
      "permission-mismatch",
      "credential-unusable",
      "client-disabled",
    ];
    if (!allowedCodes.includes(finding.code)) {
      errors.push("drift code is unsupported");
    }
    if (codes.has(finding.code)) {
      errors.push(`duplicate drift code: ${finding.code}`);
    }
    codes.add(finding.code);
    const severities: IdentityProvisioningDriftSeverity[] = [
      "informational",
      "operational",
      "security",
    ];
    if (!severities.includes(finding.severity)) {
      errors.push("drift severity is unsupported");
    }
    if (finding.securityCritical !== (finding.severity === "security")) {
      errors.push(`${finding.code} security-critical flag must match severity`);
    }
    if (!finding.path.startsWith("/")) {
      errors.push(`${finding.code} path must be a JSON pointer`);
    }
  }
}

function validateAudit(
  audit: IdentityProvisioningAuditEvent[],
  errors: string[],
): void {
  let priorSequence = 0;
  let priorTime = 0;
  for (const event of audit) {
    rejectUnknownKeys(
      event,
      [
        "sequence",
        "occurredAt",
        "eventType",
        "actor",
        "result",
        "correlationId",
        "detailCode",
      ],
      "audit event",
      errors,
    );
    if (!Number.isInteger(event.sequence) || event.sequence !== priorSequence + 1) {
      errors.push("audit sequence must be contiguous and start at one");
    }
    priorSequence = event.sequence;
    validateTimestamp(event.occurredAt, "audit occurredAt", errors);
    if (validTimestamp(event.occurredAt)) {
      const current = Date.parse(event.occurredAt);
      if (current < priorTime) errors.push("audit timestamps must be monotonic");
      priorTime = current;
    }
    if (!safeCodePattern.test(event.eventType)) {
      errors.push("audit event type is invalid");
    }
    if (!IDENTITY_PROVISIONING_ACTORS.includes(event.actor)) {
      errors.push("audit actor is unsupported");
    }
    if (!["started", "succeeded", "failed", "cancelled"].includes(event.result)) {
      errors.push("audit result is unsupported");
    }
    validateStableId(event.correlationId, "audit correlation ID", errors);
    if (!safeCodePattern.test(event.detailCode)) {
      errors.push("audit detail code is invalid");
    }
  }
}

function validateRollback(
  rollback: IdentityProvisioningRollback,
  errors: string[],
): void {
  rejectUnknownKeys(
    rollback,
    ["allowed", "restoreState", "reasonCode", "snapshotDigest"],
    "rollback",
    errors,
  );
  if (!safeCodePattern.test(rollback.reasonCode)) {
    errors.push("rollback reason code is invalid");
  }
  if (
    rollback.restoreState !== null &&
    !IDENTITY_PROVISIONING_STATES.includes(rollback.restoreState)
  ) {
    errors.push("rollback restore state is unsupported");
  }
  if (rollback.snapshotDigest !== null) {
    validateDigest(rollback.snapshotDigest, "rollback snapshot digest", errors);
  }
  if (rollback.allowed && rollback.restoreState === null) {
    errors.push("allowed rollback requires a restore state");
  }
  if (rollback.allowed && rollback.snapshotDigest === null) {
    errors.push("allowed rollback requires a snapshot digest");
  }
}

function validateError(
  error: IdentityProvisioningError | null,
  state: IdentityProvisioningState,
  errors: string[],
): void {
  if (!error) return;
  rejectUnknownKeys(
    error,
    ["code", "retryable", "retryAfter", "publicMessage"],
    "operation error",
    errors,
  );
  if (!safeCodePattern.test(error.code)) {
    errors.push("operation error code is invalid");
  }
  if (error.retryAfter !== null) {
    validateTimestamp(error.retryAfter, "error retryAfter", errors);
  }
  if (!error.publicMessage.trim() || error.publicMessage.length > 500) {
    errors.push("error publicMessage must contain 1–500 characters");
  }
  if (state !== "failed" && state !== "recovering") {
    errors.push("typed errors are allowed only while failed or recovering");
  }
}

function addVerificationDrift(
  drift: IdentityProvisioningDrift[],
  verified: boolean,
  code: IdentityProvisioningDrift["code"],
  path: string,
): void {
  if (verified) return;
  drift.push({
    code,
    severity: "security",
    securityCritical: true,
    path,
  });
}

function validateVersion(value: string, errors: string[]): void {
  if (value !== IDENTITY_PROVISIONING_CONTRACT_VERSION) {
    errors.push("unsupported identity-provisioning contract version");
  }
}

function validateStableId(
  value: string,
  label: string,
  errors: string[],
): void {
  if (!stableIdPattern.test(value)) errors.push(`${label} is invalid`);
}

function validateDigest(
  value: string,
  label: string,
  errors: string[],
): void {
  if (!digestPattern.test(value)) {
    errors.push(`${label} must be a lowercase SHA-256 digest`);
  }
}

function validateTimestamp(
  value: string,
  label: string,
  errors: string[],
): void {
  if (!validTimestamp(value)) {
    errors.push(`${label} must be an ISO 8601 UTC timestamp`);
  }
}

function validTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function validateHttpsUrl(
  value: string,
  label: string,
  errors: string[],
  allowLoopbackHttp = false,
): void {
  try {
    const parsed = new URL(value);
    const loopback =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]";
    if (
      parsed.protocol !== "https:" &&
      !(
        allowLoopbackHttp &&
        parsed.protocol === "http:" &&
        loopback
      )
    ) {
      errors.push(
        allowLoopbackHttp
          ? `${label} must use HTTPS or explicit loopback HTTP`
          : `${label} must use HTTPS`,
      );
    }
    if (parsed.username || parsed.password) {
      errors.push(`${label} cannot contain URL credentials`);
    }
    if (parsed.hash) errors.push(`${label} cannot contain a fragment`);
  } catch {
    errors.push(`${label} must be a valid URL`);
  }
}

function validateUniqueUrls(
  values: string[],
  label: string,
  required: boolean,
  errors: string[],
  originOnly = false,
  allowLoopbackHttp = false,
): void {
  if (required && values.length === 0) {
    errors.push(`at least one ${label} is required`);
  }
  if (new Set(values).size !== values.length) {
    errors.push(`${label}s must be unique`);
  }
  for (const value of values) {
    validateHttpsUrl(value, label, errors, allowLoopbackHttp);
    if (originOnly) {
      try {
        const parsed = new URL(value);
        if (parsed.pathname !== "/" || parsed.search) {
          errors.push(`${label} must be an exact origin without path or query`);
        }
      } catch {
        // validateHttpsUrl records the syntax error.
      }
    }
  }
}

function validateUniqueStrings(
  values: string[],
  label: string,
  errors: string[],
): void {
  if (new Set(values).size !== values.length) {
    errors.push(`${label}s must be unique`);
  }
  for (const value of values) {
    if (
      !value.trim() ||
      value.length > 255 ||
      /[\s\r\n]/.test(value)
    ) {
      errors.push(`${label} is invalid`);
    }
  }
}

function validateUniqueEnum<T extends string>(
  values: readonly T[],
  allowed: readonly T[],
  label: string,
  errors: string[],
): void {
  if (values.length === 0) errors.push(`at least one ${label} is required`);
  if (new Set(values).size !== values.length) {
    errors.push(`${label}s must be unique`);
  }
  for (const value of values) {
    if (!allowed.includes(value)) errors.push(`${label} is unsupported`);
  }
}

function rejectUnknownKeys(
  value: object,
  allowedKeys: readonly string[],
  label: string,
  errors: string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} contains unsupported field: ${key}`);
  }
}

function rejectForbiddenCredentialFields(
  value: unknown,
  errors: string[],
): void {
  const discovered = new Set<string>();
  visit(value);
  for (const key of discovered) {
    errors.push(`contract contains forbidden credential field: ${key}`);
  }

  function visit(candidate: unknown): void {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (forbiddenCredentialKeys.has(key.toLowerCase())) discovered.add(key);
      visit(child);
    }
  }
}

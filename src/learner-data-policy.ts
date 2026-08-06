export const LEARNER_ACCOUNT_STATES = [
  "created",
  "active",
  "suspended",
  "recovery-pending",
  "deletion-requested",
  "deleted",
] as const;

export const LEARNER_DATA_ROLES = [
  "learner",
  "support",
  "content-editor",
  "administrator",
  "system",
] as const;

export const LEARNER_DATA_PERMISSIONS = [
  "profile:read:self",
  "profile:update:self",
  "consent:manage:self",
  "transcript:read:self",
  "transcript:export:self",
  "deletion:request:self",
  "learner-summary:read:tenant",
  "account:suspend:tenant",
  "account:recover:tenant",
  "deletion:process:tenant",
  "badge:correct:tenant",
  "content:manage",
  "projection:rebuild:tenant",
  "deletion:replay:tenant",
] as const;

export type LearnerAccountState = (typeof LEARNER_ACCOUNT_STATES)[number];
export type LearnerDataRole = (typeof LEARNER_DATA_ROLES)[number];
export type LearnerDataPermission = (typeof LEARNER_DATA_PERMISSIONS)[number];

export interface LifecycleTransition {
  from: LearnerAccountState;
  to: LearnerAccountState;
  actor: "learner" | "administrator" | "system";
  condition: string;
}

export interface ConsentPurpose {
  id: string;
  required: boolean;
  description: string;
  withdrawalEffect: string;
}

export interface RetentionClass {
  id: string;
  records: string[];
  trigger: "account-active" | "account-inactive" | "record-created" | "request-completed";
  retainDays: number | null;
  disposition: string;
}

export interface LearnerDataRoleGrant {
  role: LearnerDataRole;
  permissions: LearnerDataPermission[];
  boundary: string;
}

export interface LearnerDataPolicyV1 {
  schemaVersion: 1;
  policyId: string;
  policyVersion: string;
  effectiveDate: string;
  accountBackedRecords: "planned" | "available";
  currentStorageNotice: string;
  identity: {
    protocol: "openid-connect-authorization-code-pkce";
    authoritativeKey: "issuer-subject";
    emailIsAuthoritative: false;
    automaticEmailMerge: false;
    stableSubjectRequired: true;
  };
  adapters: {
    hostedRecordStore: "cloudflare-d1";
    referenceRecordStore: "postgresql";
    identity: "openid-connect";
    identityRequirement: string;
  };
  tenancy: {
    installationOrTenantRequired: true;
    denyCrossTenantByDefault: true;
    scopeEveryCommandAndQuery: true;
  };
  profile: {
    requiredFields: string[];
    optionalFields: string[];
    prohibitedFields: string[];
  };
  lifecycle: {
    states: LearnerAccountState[];
    transitions: LifecycleTransition[];
  };
  consent: {
    recordFields: ["purpose", "policyVersion", "decision", "decidedAt"];
    purposes: ConsentPurpose[];
  };
  retention: {
    classes: RetentionClass[];
  };
  export: {
    formats: ["project42-portable-json", "transcript-csv"];
    recentAuthenticationMinutes: number;
    delivery: "single-response-download";
    publicObjectUrlAllowed: false;
    auditEventRequired: true;
  };
  deletion: {
    cancellationWindowDays: number;
    activeStoreCompletionDays: number;
    backupExpiryDays: number;
    restoreTimeDeletionReplay: true;
    receiptRetainDays: number;
    auditEventRequired: true;
  };
  recovery: {
    recoveryPointHours: number;
    recoveryTimeHours: number;
    restoreTestCadenceDays: number;
    deletionReplayRequired: true;
  };
  authorization: {
    denyByDefault: true;
    privilegedActionsAudited: true;
    grants: LearnerDataRoleGrant[];
  };
}

export interface LearnerDataPolicyValidation {
  valid: boolean;
  errors: string[];
}

export const LEARNER_DATA_POLICY_VERSION = "2026-07-27";
export const TERMS_OF_SERVICE_VERSION = "1.0";
export const LEARNER_CONSENT_PURPOSES = [
  "product-improvement",
  "learning-reminders",
] as const;
export type LearnerConsentPurpose = (typeof LEARNER_CONSENT_PURPOSES)[number];

const transitions: LifecycleTransition[] = [
  {
    from: "created",
    to: "active",
    actor: "learner",
    condition: "Required service consent is recorded and identity binding succeeds.",
  },
  {
    from: "created",
    to: "deletion-requested",
    actor: "learner",
    condition: "The learner abandons account creation and requests removal.",
  },
  {
    from: "active",
    to: "suspended",
    actor: "administrator",
    condition: "A documented safety or account-integrity reason is recorded.",
  },
  {
    from: "active",
    to: "recovery-pending",
    actor: "learner",
    condition: "The learner begins an identity recovery flow.",
  },
  {
    from: "active",
    to: "deletion-requested",
    actor: "learner",
    condition: "The learner confirms the deletion scope and consequences.",
  },
  {
    from: "suspended",
    to: "active",
    actor: "administrator",
    condition: "The documented suspension reason is resolved.",
  },
  {
    from: "suspended",
    to: "recovery-pending",
    actor: "learner",
    condition: "The learner begins an identity recovery flow.",
  },
  {
    from: "suspended",
    to: "deletion-requested",
    actor: "learner",
    condition: "Deletion remains available while the account is suspended.",
  },
  {
    from: "recovery-pending",
    to: "active",
    actor: "system",
    condition: "The configured identity provider completes recovery.",
  },
  {
    from: "recovery-pending",
    to: "suspended",
    actor: "administrator",
    condition: "Recovery cannot be verified without unsafe disclosure.",
  },
  {
    from: "recovery-pending",
    to: "deletion-requested",
    actor: "learner",
    condition: "The learner requests deletion instead of continuing recovery.",
  },
  {
    from: "deletion-requested",
    to: "active",
    actor: "learner",
    condition: "The request is cancelled inside the cancellation window.",
  },
  {
    from: "deletion-requested",
    to: "deleted",
    actor: "system",
    condition: "Active stores are erased and adapter receipts are verified.",
  },
];

export const defaultLearnerDataPolicy: LearnerDataPolicyV1 = {
  schemaVersion: 1,
  policyId: "project42-learner-data",
  policyVersion: LEARNER_DATA_POLICY_VERSION,
  effectiveDate: "2026-07-27",
  // AB#6425: this states what the released software supports, not what any one
  // deployment has switched on. The durable account-backed record contract is
  // released, so reporting "planned" understated the shipped capability. Whether
  // a given distribution actually stores account-backed records depends on it
  // configuring an account service, which the notice below and the rendered
  // learner-data page describe - keeping self-hosted and unconfigured
  // distributions provider-neutral.
  accountBackedRecords: "available",
  currentStorageNotice:
    "Project 42 keeps learner progress in this browser. A deployment that configures an account service also stores approved learner records durably across devices; without that configuration only browser-local progress is kept.",
  identity: {
    protocol: "openid-connect-authorization-code-pkce",
    authoritativeKey: "issuer-subject",
    emailIsAuthoritative: false,
    automaticEmailMerge: false,
    stableSubjectRequired: true,
  },
  adapters: {
    hostedRecordStore: "cloudflare-d1",
    referenceRecordStore: "postgresql",
    identity: "openid-connect",
    identityRequirement:
      "The configured provider must expose a stable issuer and subject; email is display/contact data only.",
  },
  tenancy: {
    installationOrTenantRequired: true,
    denyCrossTenantByDefault: true,
    scopeEveryCommandAndQuery: true,
  },
  profile: {
    requiredFields: ["learnerId", "tenantId", "lifecycleState", "createdAt", "updatedAt"],
    optionalFields: [
      "displayName",
      "locale",
      "timeZone",
      "reducedMotion",
      "highContrast",
    ],
    prohibitedFields: [
      "password",
      "governmentIdentifier",
      "dateOfBirth",
      "advertisingProfile",
    ],
  },
  lifecycle: {
    states: [...LEARNER_ACCOUNT_STATES],
    transitions,
  },
  consent: {
    recordFields: ["purpose", "policyVersion", "decision", "decidedAt"],
    purposes: [
      {
        id: "learning-record",
        required: true,
        description:
          "Store and maintain a durable learning record tied to your account.",
        withdrawalEffect:
          "The learning record is required for account-backed progress. Withdrawing this consent will delete your account and learning data.",
      },
      {
        id: "product-improvement",
        required: false,
        description: "Use minimized, non-transcript events to improve the learning experience.",
        withdrawalEffect: "Stops future optional product-improvement events.",
      },
      {
        id: "learning-reminders",
        required: false,
        description: "Send learner-requested progress and review reminders.",
        withdrawalEffect: "Stops future reminders without deleting the learning record.",
      },
    ],
  },
  retention: {
    classes: [
      {
        id: "active-account",
        records: ["profile", "consent", "enrollment", "learning-events", "attempts", "badges"],
        trigger: "account-active",
        retainDays: null,
        disposition: "Retain while the learner keeps the account active.",
      },
      {
        id: "inactive-account",
        records: ["profile", "consent", "enrollment", "learning-events", "attempts", "badges"],
        trigger: "account-inactive",
        retainDays: 730,
        disposition: "Notify before expiry, then run the verified deletion workflow.",
      },
      {
        id: "privileged-audit",
        records: ["privileged-access-events", "export-events", "deletion-events"],
        trigger: "record-created",
        retainDays: 365,
        disposition: "Delete event detail after the audit window.",
      },
      {
        id: "support-diagnostics",
        records: ["support-case-diagnostics"],
        trigger: "record-created",
        retainDays: 30,
        disposition: "Delete diagnostic detail and retain only a non-sensitive case outcome.",
      },
      {
        id: "deletion-receipt",
        records: ["deletion-receipt"],
        trigger: "request-completed",
        retainDays: 90,
        disposition: "Delete the receipt after the dispute window.",
      },
    ],
  },
  export: {
    formats: ["project42-portable-json", "transcript-csv"],
    recentAuthenticationMinutes: 15,
    delivery: "single-response-download",
    publicObjectUrlAllowed: false,
    auditEventRequired: true,
  },
  deletion: {
    cancellationWindowDays: 7,
    activeStoreCompletionDays: 7,
    backupExpiryDays: 35,
    restoreTimeDeletionReplay: true,
    receiptRetainDays: 90,
    auditEventRequired: true,
  },
  recovery: {
    recoveryPointHours: 24,
    recoveryTimeHours: 8,
    restoreTestCadenceDays: 90,
    deletionReplayRequired: true,
  },
  authorization: {
    denyByDefault: true,
    privilegedActionsAudited: true,
    grants: [
      {
        role: "learner",
        permissions: [
          "profile:read:self",
          "profile:update:self",
          "consent:manage:self",
          "transcript:read:self",
          "transcript:export:self",
          "deletion:request:self",
        ],
        boundary: "Only the authenticated learner's own record in the current tenant.",
      },
      {
        role: "support",
        permissions: ["learner-summary:read:tenant"],
        boundary:
          "Read-only minimized summary for an active support case in the assigned tenant.",
      },
      {
        role: "content-editor",
        permissions: ["content:manage"],
        boundary: "Curriculum content only; no learner-data access.",
      },
      {
        role: "administrator",
        permissions: [
          "learner-summary:read:tenant",
          "account:suspend:tenant",
          "account:recover:tenant",
          "deletion:process:tenant",
          "badge:correct:tenant",
        ],
        boundary: "Explicit privileged role, current tenant only, with immutable audit events.",
      },
      {
        role: "system",
        permissions: ["projection:rebuild:tenant", "deletion:replay:tenant"],
        boundary: "Named service operation in one tenant with auditable execution context.",
      },
    ],
  },
};

export function canTransitionLearnerAccount(
  policy: LearnerDataPolicyV1,
  from: LearnerAccountState,
  to: LearnerAccountState,
): boolean {
  return policy.lifecycle.transitions.some(
    (transition) => transition.from === from && transition.to === to,
  );
}

export function learnerDataRoleCan(
  policy: LearnerDataPolicyV1,
  role: LearnerDataRole,
  permission: LearnerDataPermission,
): boolean {
  return (
    policy.authorization.grants
      .find((grant) => grant.role === role)
      ?.permissions.includes(permission) ?? false
  );
}

export function validateLearnerDataPolicy(
  policy: LearnerDataPolicyV1,
): LearnerDataPolicyValidation {
  const errors: string[] = [];
  const stateSet = new Set(policy.lifecycle.states);
  const roleSet = new Set(policy.authorization.grants.map((grant) => grant.role));

  if (policy.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(policy.policyVersion)) {
    errors.push("policyVersion must be an ISO date");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(policy.effectiveDate)) {
    errors.push("effectiveDate must be an ISO date");
  }
  if (policy.identity.protocol !== "openid-connect-authorization-code-pkce") {
    errors.push("identity must use OpenID Connect Authorization Code with PKCE");
  }
  if (policy.identity.authoritativeKey !== "issuer-subject") {
    errors.push("identity must be keyed by issuer and subject");
  }
  if (
    policy.identity.emailIsAuthoritative !== false ||
    policy.identity.automaticEmailMerge !== false
  ) {
    errors.push("email cannot be authoritative or used for automatic account merging");
  }
  if (!policy.identity.stableSubjectRequired) {
    errors.push("identity must require a stable subject");
  }
  if (policy.adapters.hostedRecordStore !== "cloudflare-d1") {
    errors.push("the default hosted record store must be Cloudflare D1");
  }
  if (policy.adapters.referenceRecordStore !== "postgresql") {
    errors.push("the reference self-host record store must be PostgreSQL");
  }
  if (
    !policy.tenancy.installationOrTenantRequired ||
    !policy.tenancy.denyCrossTenantByDefault ||
    !policy.tenancy.scopeEveryCommandAndQuery
  ) {
    errors.push("every command and query must deny cross-tenant access by default");
  }

  for (const state of LEARNER_ACCOUNT_STATES) {
    if (!stateSet.has(state)) errors.push(`missing lifecycle state: ${state}`);
  }
  for (const transition of policy.lifecycle.transitions) {
    if (!stateSet.has(transition.from) || !stateSet.has(transition.to)) {
      errors.push(`transition references an unknown state: ${transition.from} -> ${transition.to}`);
    }
    if (transition.from === "deleted") {
      errors.push("deleted is terminal and cannot have outbound transitions");
    }
  }
  if (!canTransitionLearnerAccount(policy, "deletion-requested", "deleted")) {
    errors.push("deletion-requested must transition to deleted");
  }
  if (!canTransitionLearnerAccount(policy, "deletion-requested", "active")) {
    errors.push("deletion-requested must be cancellable during the policy window");
  }

  const consentIds = policy.consent.purposes.map((purpose) => purpose.id);
  if (new Set(consentIds).size !== consentIds.length) {
    errors.push("consent purpose IDs must be unique");
  }
  if (!policy.consent.purposes.some((purpose) => purpose.id === "learning-record" && purpose.required)) {
    errors.push("learning-record consent must be explicit and required");
  }

  const retentionIds = policy.retention.classes.map((entry) => entry.id);
  if (new Set(retentionIds).size !== retentionIds.length) {
    errors.push("retention class IDs must be unique");
  }
  for (const entry of policy.retention.classes) {
    if (entry.retainDays !== null && entry.retainDays <= 0) {
      errors.push(`retention class ${entry.id} must have a positive retention window`);
    }
  }

  if (
    !policy.deletion.restoreTimeDeletionReplay ||
    !policy.recovery.deletionReplayRequired ||
    policy.deletion.backupExpiryDays <= 0
  ) {
    errors.push("deletion must expire from backups and replay after restore");
  }
  if (
    policy.recovery.recoveryPointHours <= 0 ||
    policy.recovery.recoveryTimeHours <= 0 ||
    policy.recovery.restoreTestCadenceDays <= 0
  ) {
    errors.push("recovery objectives and restore cadence must be positive");
  }
  if (policy.export.publicObjectUrlAllowed || !policy.export.auditEventRequired) {
    errors.push("exports must be audited and cannot use public object URLs");
  }
  if (!policy.authorization.denyByDefault || !policy.authorization.privilegedActionsAudited) {
    errors.push("authorization must deny by default and audit privileged actions");
  }
  for (const role of LEARNER_DATA_ROLES) {
    if (!roleSet.has(role)) errors.push(`missing authorization role: ${role}`);
  }
  const contentEditor = policy.authorization.grants.find(
    (grant) => grant.role === "content-editor",
  );
  if (
    contentEditor?.permissions.some(
      (permission) =>
        permission.startsWith("profile:") ||
        permission.startsWith("transcript:") ||
        permission.startsWith("deletion:"),
    )
  ) {
    errors.push("content editors cannot access learner records");
  }

  return { valid: errors.length === 0, errors };
}

import type { ValidationResult } from "./schema.js";

export const BADGE_DEFINITION_CONTRACT_VERSION = "1.0" as const;
export const BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION = "1.0" as const;

export const SUPPORTED_BADGE_DEFINITION_CONTRACT_VERSIONS = [
  BADGE_DEFINITION_CONTRACT_VERSION,
] as const;
export const SUPPORTED_BADGE_LIFECYCLE_EVENT_CONTRACT_VERSIONS = [
  BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION,
] as const;

export const BADGE_CLASSES = [
  "participation",
  "completion",
  "mastery",
] as const;

export const BADGE_EVIDENCE_KINDS = [
  "module.visited",
  "module.completed",
  "assessment.passed",
  "capstone.passed",
  "human-review.approved",
] as const;

export const BADGE_EVIDENCE_RESULTS = [
  "visited",
  "completed",
  "passed",
  "approved",
] as const;

export const BADGE_LIFECYCLE_EVENT_TYPES = [
  "badge.issued",
  "badge.corrected",
  "badge.revoked",
  "badge.expired",
] as const;

export const BADGE_CREDENTIAL_STATUSES = [
  "active",
  "revoked",
  "expired",
] as const;

export const BADGE_LIFECYCLE_ACTOR_TYPES = [
  "system",
  "owner",
  "administrator",
] as const;

export const OPEN_BADGES_3_MAPPING_BOUNDARY = Object.freeze({
  targetVersion: "3.0",
  status: "future-mapping-not-conformant",
  conformanceClaim: false,
} as const);

export type BadgeClass = (typeof BADGE_CLASSES)[number];
export type BadgeEvidenceKind = (typeof BADGE_EVIDENCE_KINDS)[number];
export type BadgeEvidenceResult = (typeof BADGE_EVIDENCE_RESULTS)[number];
export type BadgeLifecycleEventType =
  (typeof BADGE_LIFECYCLE_EVENT_TYPES)[number];
export type BadgeCredentialStatus =
  (typeof BADGE_CREDENTIAL_STATUSES)[number];
export type BadgeLifecycleActorType =
  (typeof BADGE_LIFECYCLE_ACTOR_TYPES)[number];

export interface BadgeDisplayTextV1 {
  language: string;
  name: string;
  description: string;
  criteriaSummary: string;
}

export interface BadgeIssuerPolicyV1 {
  id: string;
  version: string;
  issuerId: string;
  issuanceMode: "durable-record-only";
  correctionMode: "append-only";
  revocationMode: "append-only";
  requiresApprovedIdentity: true;
}

export interface BadgeEvidenceRequirementV1 {
  id: string;
  kind: BadgeEvidenceKind;
  subjectId: string;
  subjectVersion: string;
  contentVersion: string;
  requiredResult: BadgeEvidenceResult;
  minimumScorePercent: number | null;
}

export interface BadgeCriteriaV1 {
  id: string;
  version: string;
  statement: string;
  allRequired: true;
  evidence: BadgeEvidenceRequirementV1[];
}

export type BadgeExpirationPolicyV1 =
  | {
      kind: "never";
    }
  | {
      kind: "after-days";
      days: number;
    };

export interface OpenBadges3MappingBoundaryV1 {
  targetVersion: typeof OPEN_BADGES_3_MAPPING_BOUNDARY.targetVersion;
  status: typeof OPEN_BADGES_3_MAPPING_BOUNDARY.status;
  conformanceClaim: typeof OPEN_BADGES_3_MAPPING_BOUNDARY.conformanceClaim;
}

export interface BadgeDefinitionV1 {
  schemaVersion: typeof BADGE_DEFINITION_CONTRACT_VERSION;
  id: string;
  version: string;
  badgeClass: BadgeClass;
  defaultLanguage: string;
  display: BadgeDisplayTextV1[];
  issuerPolicy: BadgeIssuerPolicyV1;
  criteria: BadgeCriteriaV1;
  expirationPolicy: BadgeExpirationPolicyV1;
  openBadges3: OpenBadges3MappingBoundaryV1;
}

export interface BadgeEvidenceV1 {
  id: string;
  kind: BadgeEvidenceKind;
  subjectId: string;
  subjectVersion: string;
  contentVersion: string;
  result: BadgeEvidenceResult;
  scorePercent: number | null;
  occurredAt: string;
  evidenceRefs: string[];
}

export interface BadgeLifecycleActorV1 {
  type: BadgeLifecycleActorType;
  id: string;
}

export interface BadgeLifecycleEventBaseV1 {
  schemaVersion: typeof BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION;
  eventId: string;
  sequence: number;
  type: BadgeLifecycleEventType;
  credentialId: string;
  occurredAt: string;
  actor: BadgeLifecycleActorV1;
}

export interface BadgeIssuedEventV1 extends BadgeLifecycleEventBaseV1 {
  type: "badge.issued";
  badgeDefinitionId: string;
  badgeDefinitionVersion: string;
  subjectId: string;
  issuerId: string;
  evidence: BadgeEvidenceV1[];
}

export interface BadgeCorrectedEventV1 extends BadgeLifecycleEventBaseV1 {
  type: "badge.corrected";
  supersedesEventId: string;
  reason: string;
  replacementEvidence: BadgeEvidenceV1[];
}

export interface BadgeRevokedEventV1 extends BadgeLifecycleEventBaseV1 {
  type: "badge.revoked";
  supersedesEventId: string;
  reason: string;
}

export interface BadgeExpiredEventV1 extends BadgeLifecycleEventBaseV1 {
  type: "badge.expired";
  supersedesEventId: string;
  reason: string;
}

export type BadgeLifecycleEventV1 =
  | BadgeIssuedEventV1
  | BadgeCorrectedEventV1
  | BadgeRevokedEventV1
  | BadgeExpiredEventV1;

export interface BadgeCredentialProjectionV1 {
  schemaVersion: typeof BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION;
  credentialId: string;
  badgeDefinitionId: string;
  badgeDefinitionVersion: string;
  badgeClass: BadgeClass;
  subjectId: string;
  issuerId: string;
  issuedAt: string;
  status: BadgeCredentialStatus;
  originalIssuance: BadgeIssuedEventV1;
  effectiveEvidence: BadgeEvidenceV1[];
  corrections: BadgeCorrectedEventV1[];
  revocation: BadgeRevokedEventV1 | null;
  expiration: BadgeExpiredEventV1 | null;
  lastEventId: string;
  lastSequence: number;
}

export type BadgeCredentialErrorCode =
  | "invalid-definition"
  | "duplicate-definition"
  | "invalid-event"
  | "duplicate-event"
  | "duplicate-sequence"
  | "missing-definition"
  | "duplicate-issuance"
  | "missing-issuance"
  | "invalid-evidence"
  | "issuer-mismatch"
  | "invalid-lifecycle-transition"
  | "invalid-lifecycle-chain"
  | "premature-expiration";

export class BadgeCredentialError extends Error {
  readonly code: BadgeCredentialErrorCode;

  constructor(code: BadgeCredentialErrorCode, message: string) {
    super(message);
    this.name = "BadgeCredentialError";
    this.code = code;
  }
}

const stableIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const languagePattern = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const evidenceResultByKind: Record<BadgeEvidenceKind, BadgeEvidenceResult> = {
  "module.visited": "visited",
  "module.completed": "completed",
  "assessment.passed": "passed",
  "capstone.passed": "passed",
  "human-review.approved": "approved",
};

export function validateBadgeDefinition(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ["badge definition must be an object"] };
  }

  rejectUnknownKeys(
    value,
    [
      "schemaVersion",
      "id",
      "version",
      "badgeClass",
      "defaultLanguage",
      "display",
      "issuerPolicy",
      "criteria",
      "expirationPolicy",
      "openBadges3",
    ],
    "badge definition",
    errors,
  );
  if (value.schemaVersion !== BADGE_DEFINITION_CONTRACT_VERSION) {
    errors.push("unsupported badge-definition schema version");
  }
  validateStableId(value.id, "badge definition ID", errors);
  validateVersion(value.version, "badge definition version", errors);
  if (
    typeof value.badgeClass !== "string" ||
    !includes(BADGE_CLASSES, value.badgeClass)
  ) {
    errors.push("badge class is unsupported");
  }
  if (
    typeof value.defaultLanguage !== "string" ||
    !languagePattern.test(value.defaultLanguage)
  ) {
    errors.push("default display language is invalid");
  }
  validateDisplay(value.display, value.defaultLanguage, errors);
  validateIssuerPolicy(value.issuerPolicy, errors);
  validateCriteria(value.criteria, value.badgeClass, errors);
  validateExpirationPolicy(value.expirationPolicy, errors);
  validateOpenBadgesBoundary(value.openBadges3, errors);

  return { valid: errors.length === 0, errors };
}

export function validateBadgeLifecycleEvent(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ["badge lifecycle event must be an object"] };
  }

  if (value.schemaVersion !== BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION) {
    errors.push("unsupported badge-lifecycle event schema version");
  }
  validateStableId(value.eventId, "event ID", errors);
  if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) <= 0) {
    errors.push("event sequence must be a positive safe integer");
  }
  if (
    typeof value.type !== "string" ||
    !includes(BADGE_LIFECYCLE_EVENT_TYPES, value.type)
  ) {
    errors.push("badge lifecycle event type is unsupported");
  }
  validateStableId(value.credentialId, "credential ID", errors);
  validateTimestamp(value.occurredAt, "event occurredAt", errors);
  validateActor(value.actor, errors);

  switch (value.type) {
    case "badge.issued":
      rejectUnknownKeys(
        value,
        [
          "schemaVersion",
          "eventId",
          "sequence",
          "type",
          "credentialId",
          "occurredAt",
          "actor",
          "badgeDefinitionId",
          "badgeDefinitionVersion",
          "subjectId",
          "issuerId",
          "evidence",
        ],
        "badge-issued event",
        errors,
      );
      validateStableId(
        value.badgeDefinitionId,
        "issued badge definition ID",
        errors,
      );
      validateVersion(
        value.badgeDefinitionVersion,
        "issued badge definition version",
        errors,
      );
      validateStableId(value.subjectId, "issued badge subject ID", errors);
      validateStableId(value.issuerId, "issued badge issuer ID", errors);
      validateEvidenceArray(value.evidence, "issued badge evidence", errors);
      break;
    case "badge.corrected":
      rejectUnknownKeys(
        value,
        [
          "schemaVersion",
          "eventId",
          "sequence",
          "type",
          "credentialId",
          "occurredAt",
          "actor",
          "supersedesEventId",
          "reason",
          "replacementEvidence",
        ],
        "badge-corrected event",
        errors,
      );
      validateStableId(
        value.supersedesEventId,
        "superseded event ID",
        errors,
      );
      validateReason(value.reason, "correction reason", errors);
      validateEvidenceArray(
        value.replacementEvidence,
        "replacement badge evidence",
        errors,
      );
      break;
    case "badge.revoked":
    case "badge.expired":
      rejectUnknownKeys(
        value,
        [
          "schemaVersion",
          "eventId",
          "sequence",
          "type",
          "credentialId",
          "occurredAt",
          "actor",
          "supersedesEventId",
          "reason",
        ],
        value.type,
        errors,
      );
      validateStableId(
        value.supersedesEventId,
        "superseded event ID",
        errors,
      );
      validateReason(value.reason, "lifecycle reason", errors);
      break;
    default:
      rejectUnknownKeys(
        value,
        [
          "schemaVersion",
          "eventId",
          "sequence",
          "type",
          "credentialId",
          "occurredAt",
          "actor",
        ],
        "unsupported badge lifecycle event",
        errors,
      );
  }

  return { valid: errors.length === 0, errors };
}

export function validateBadgeIssuanceEvidence(
  definition: BadgeDefinitionV1,
  evidence: readonly BadgeEvidenceV1[],
): ValidationResult {
  const errors: string[] = [];
  const definitionValidation = validateBadgeDefinition(definition);
  if (!definitionValidation.valid) {
    errors.push(
      ...definitionValidation.errors.map(
        (error) => `invalid badge definition: ${error}`,
      ),
    );
    return { valid: false, errors };
  }

  validateEvidenceArray(evidence, "badge evidence", errors);
  if (errors.length > 0) return { valid: false, errors };

  for (const requirement of definition.criteria.evidence) {
    const candidates = evidence.filter(
      (item) =>
        item.kind === requirement.kind &&
        item.subjectId === requirement.subjectId &&
        item.subjectVersion === requirement.subjectVersion &&
        item.contentVersion === requirement.contentVersion &&
        item.result === requirement.requiredResult,
    );
    const satisfied = candidates.some(
      (item) =>
        requirement.minimumScorePercent === null ||
        (item.scorePercent !== null &&
          item.scorePercent >= requirement.minimumScorePercent),
    );
    if (!satisfied) {
      errors.push(
        `required evidence ${requirement.id} is missing or does not satisfy its version-bound result`,
      );
    }
  }

  if (definition.badgeClass === "mastery") {
    const passingAssessment = evidence.some(
      (item) =>
        item.kind === "assessment.passed" &&
        item.result === "passed" &&
        item.subjectVersion.length > 0 &&
        item.contentVersion.length > 0,
    );
    if (!passingAssessment) {
      errors.push(
        "mastery issuance requires passing version-bound assessment evidence",
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export function projectBadgeLifecycle(
  definitions: readonly unknown[],
  events: readonly unknown[],
): BadgeCredentialProjectionV1[] {
  const definitionIndex = new Map<string, BadgeDefinitionV1>();
  for (const value of definitions) {
    const validation = validateBadgeDefinition(value);
    if (!validation.valid) {
      throw new BadgeCredentialError(
        "invalid-definition",
        validation.errors.join("; "),
      );
    }
    const definition = clone(value as BadgeDefinitionV1);
    const key = definitionKey(definition.id, definition.version);
    if (definitionIndex.has(key)) {
      throw new BadgeCredentialError(
        "duplicate-definition",
        `Duplicate badge definition ${key}.`,
      );
    }
    definitionIndex.set(key, definition);
  }

  const parsedEvents: BadgeLifecycleEventV1[] = [];
  const eventIds = new Set<string>();
  const credentialSequences = new Set<string>();
  for (const value of events) {
    const validation = validateBadgeLifecycleEvent(value);
    if (!validation.valid) {
      throw new BadgeCredentialError(
        "invalid-event",
        validation.errors.join("; "),
      );
    }
    const event = clone(value as BadgeLifecycleEventV1);
    if (eventIds.has(event.eventId)) {
      throw new BadgeCredentialError(
        "duplicate-event",
        `Duplicate badge lifecycle event ${event.eventId}.`,
      );
    }
    const credentialSequence = `${event.credentialId}:${event.sequence}`;
    if (credentialSequences.has(credentialSequence)) {
      throw new BadgeCredentialError(
        "duplicate-sequence",
        `Duplicate badge lifecycle sequence ${event.sequence} for credential ${event.credentialId}.`,
      );
    }
    eventIds.add(event.eventId);
    credentialSequences.add(credentialSequence);
    parsedEvents.push(event);
  }

  parsedEvents.sort(
    (left, right) =>
      left.sequence - right.sequence ||
      left.eventId.localeCompare(right.eventId),
  );

  const projections = new Map<string, BadgeCredentialProjectionV1>();
  for (const event of parsedEvents) {
    if (event.type === "badge.issued") {
      if (projections.has(event.credentialId)) {
        throw new BadgeCredentialError(
          "duplicate-issuance",
          `Credential ${event.credentialId} already has an issuance event.`,
        );
      }
      const definition = definitionIndex.get(
        definitionKey(
          event.badgeDefinitionId,
          event.badgeDefinitionVersion,
        ),
      );
      if (!definition) {
        throw new BadgeCredentialError(
          "missing-definition",
          `Badge definition ${event.badgeDefinitionId}@${event.badgeDefinitionVersion} is unavailable.`,
        );
      }
      if (event.issuerId !== definition.issuerPolicy.issuerId) {
        throw new BadgeCredentialError(
          "issuer-mismatch",
          `Credential ${event.credentialId} does not use the definition issuer.`,
        );
      }
      assertEvidence(
        definition,
        event.evidence,
        event.credentialId,
        event.occurredAt,
      );
      projections.set(event.credentialId, {
        schemaVersion: BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION,
        credentialId: event.credentialId,
        badgeDefinitionId: event.badgeDefinitionId,
        badgeDefinitionVersion: event.badgeDefinitionVersion,
        badgeClass: definition.badgeClass,
        subjectId: event.subjectId,
        issuerId: event.issuerId,
        issuedAt: event.occurredAt,
        status: "active",
        originalIssuance: clone(event),
        effectiveEvidence: clone(event.evidence),
        corrections: [],
        revocation: null,
        expiration: null,
        lastEventId: event.eventId,
        lastSequence: event.sequence,
      });
      continue;
    }

    const projection = projections.get(event.credentialId);
    if (!projection) {
      throw new BadgeCredentialError(
        "missing-issuance",
        `Credential ${event.credentialId} has lifecycle activity before issuance.`,
      );
    }
    if (projection.status !== "active") {
      throw new BadgeCredentialError(
        "invalid-lifecycle-transition",
        `Credential ${event.credentialId} cannot change after ${projection.status}.`,
      );
    }
    if (event.supersedesEventId !== projection.lastEventId) {
      throw new BadgeCredentialError(
        "invalid-lifecycle-chain",
        `Event ${event.eventId} does not supersede the current event for credential ${event.credentialId}.`,
      );
    }

    const definition = definitionIndex.get(
      definitionKey(
        projection.badgeDefinitionId,
        projection.badgeDefinitionVersion,
      ),
    );
    if (!definition) {
      throw new BadgeCredentialError(
        "missing-definition",
        `Badge definition for credential ${event.credentialId} is unavailable.`,
      );
    }

    switch (event.type) {
      case "badge.corrected":
        assertEvidence(
          definition,
          event.replacementEvidence,
          event.credentialId,
          event.occurredAt,
        );
        projection.corrections = [
          ...projection.corrections,
          clone(event),
        ];
        projection.effectiveEvidence = clone(event.replacementEvidence);
        break;
      case "badge.revoked":
        projection.status = "revoked";
        projection.revocation = clone(event);
        break;
      case "badge.expired":
        assertExpirationEligible(definition, projection, event);
        projection.status = "expired";
        projection.expiration = clone(event);
        break;
    }
    projection.lastEventId = event.eventId;
    projection.lastSequence = event.sequence;
  }

  return [...projections.values()]
    .sort((left, right) => left.credentialId.localeCompare(right.credentialId))
    .map((projection) => clone(projection));
}

function validateDisplay(
  value: unknown,
  defaultLanguage: unknown,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push("at least one badge display-language entry is required");
    return;
  }
  const languages = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      errors.push(`display entry ${index} must be an object`);
      continue;
    }
    rejectUnknownKeys(
      item,
      ["language", "name", "description", "criteriaSummary"],
      `display entry ${index}`,
      errors,
    );
    if (
      typeof item.language !== "string" ||
      !languagePattern.test(item.language)
    ) {
      errors.push(`display entry ${index} language is invalid`);
    } else if (languages.has(item.language.toLowerCase())) {
      errors.push(`display language ${item.language} is duplicated`);
    } else {
      languages.add(item.language.toLowerCase());
    }
    validateText(item.name, `display entry ${index} name`, 160, errors);
    validateText(
      item.description,
      `display entry ${index} description`,
      1_000,
      errors,
    );
    validateText(
      item.criteriaSummary,
      `display entry ${index} criteria summary`,
      1_000,
      errors,
    );
  }
  if (
    typeof defaultLanguage === "string" &&
    !languages.has(defaultLanguage.toLowerCase())
  ) {
    errors.push("default display language must have a display entry");
  }
}

function validateIssuerPolicy(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("issuer policy must be an object");
    return;
  }
  rejectUnknownKeys(
    value,
    [
      "id",
      "version",
      "issuerId",
      "issuanceMode",
      "correctionMode",
      "revocationMode",
      "requiresApprovedIdentity",
    ],
    "issuer policy",
    errors,
  );
  validateStableId(value.id, "issuer policy ID", errors);
  validateVersion(value.version, "issuer policy version", errors);
  validateStableId(value.issuerId, "issuer ID", errors);
  if (value.issuanceMode !== "durable-record-only") {
    errors.push("issuer policy must require durable-record-only issuance");
  }
  if (value.correctionMode !== "append-only") {
    errors.push("issuer policy must require append-only correction");
  }
  if (value.revocationMode !== "append-only") {
    errors.push("issuer policy must require append-only revocation");
  }
  if (value.requiresApprovedIdentity !== true) {
    errors.push("issuer policy must require an approved identity");
  }
}

function validateCriteria(
  value: unknown,
  badgeClass: unknown,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push("badge criteria must be an object");
    return;
  }
  rejectUnknownKeys(
    value,
    ["id", "version", "statement", "allRequired", "evidence"],
    "badge criteria",
    errors,
  );
  validateStableId(value.id, "badge criteria ID", errors);
  validateVersion(value.version, "badge criteria version", errors);
  validateText(value.statement, "badge criteria statement", 2_000, errors);
  if (value.allRequired !== true) {
    errors.push("badge criteria must require all declared evidence");
  }
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) {
    errors.push("badge criteria must declare required evidence");
    return;
  }

  const requirementIds = new Set<string>();
  const validRequirements: BadgeEvidenceRequirementV1[] = [];
  for (const [index, requirement] of value.evidence.entries()) {
    const before = errors.length;
    validateEvidenceRequirement(requirement, index, errors);
    if (
      isRecord(requirement) &&
      typeof requirement.id === "string" &&
      requirementIds.has(requirement.id)
    ) {
      errors.push(`badge evidence requirement ${requirement.id} is duplicated`);
    } else if (isRecord(requirement) && typeof requirement.id === "string") {
      requirementIds.add(requirement.id);
    }
    if (errors.length === before && isRecord(requirement)) {
      validRequirements.push(
        requirement as unknown as BadgeEvidenceRequirementV1,
      );
    }
  }

  if (badgeClass === "completion") {
    if (
      validRequirements.every(
        (requirement) => requirement.kind === "module.visited",
      )
    ) {
      errors.push("completion criteria cannot be satisfied by visits alone");
    }
  }
  if (badgeClass === "mastery") {
    if (
      validRequirements.some(
        (requirement) => requirement.kind === "module.visited",
      )
    ) {
      errors.push("mastery criteria cannot require visit-only evidence");
    }
    const assessmentRequirements = validRequirements.filter(
      (requirement) => requirement.kind === "assessment.passed",
    );
    if (assessmentRequirements.length === 0) {
      errors.push(
        "mastery criteria must require a passing version-bound assessment",
      );
    }
    if (
      assessmentRequirements.some(
        (requirement) => requirement.minimumScorePercent === null,
      )
    ) {
      errors.push(
        "mastery assessment evidence must declare a minimum passing score",
      );
    }
  }
}

function validateEvidenceRequirement(
  value: unknown,
  index: number,
  errors: string[],
): void {
  const prefix = `evidence requirement ${index}`;
  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  rejectUnknownKeys(
    value,
    [
      "id",
      "kind",
      "subjectId",
      "subjectVersion",
      "contentVersion",
      "requiredResult",
      "minimumScorePercent",
    ],
    prefix,
    errors,
  );
  validateStableId(value.id, `${prefix} ID`, errors);
  if (
    typeof value.kind !== "string" ||
    !includes(BADGE_EVIDENCE_KINDS, value.kind)
  ) {
    errors.push(`${prefix} kind is unsupported`);
  }
  validateStableId(value.subjectId, `${prefix} subject ID`, errors);
  validateVersion(value.subjectVersion, `${prefix} subject version`, errors);
  validateVersion(value.contentVersion, `${prefix} content version`, errors);
  if (
    typeof value.requiredResult !== "string" ||
    !includes(BADGE_EVIDENCE_RESULTS, value.requiredResult)
  ) {
    errors.push(`${prefix} required result is unsupported`);
  }
  if (
    typeof value.kind === "string" &&
    includes(BADGE_EVIDENCE_KINDS, value.kind) &&
    value.requiredResult !== evidenceResultByKind[value.kind]
  ) {
    errors.push(`${prefix} result does not match its evidence kind`);
  }
  validateScore(
    value.minimumScorePercent,
    `${prefix} minimum score`,
    errors,
  );
  if (
    value.minimumScorePercent !== null &&
    value.kind !== "assessment.passed" &&
    value.kind !== "capstone.passed"
  ) {
    errors.push(`${prefix} can only score assessments or capstones`);
  }
}

function validateEvidenceArray(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return;
  }
  const ids = new Set<string>();
  for (const [index, evidence] of value.entries()) {
    const prefix = `${label} entry ${index}`;
    if (!isRecord(evidence)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    rejectUnknownKeys(
      evidence,
      [
        "id",
        "kind",
        "subjectId",
        "subjectVersion",
        "contentVersion",
        "result",
        "scorePercent",
        "occurredAt",
        "evidenceRefs",
      ],
      prefix,
      errors,
    );
    validateStableId(evidence.id, `${prefix} ID`, errors);
    if (typeof evidence.id === "string" && ids.has(evidence.id)) {
      errors.push(`${label} ID ${evidence.id} is duplicated`);
    } else if (typeof evidence.id === "string") {
      ids.add(evidence.id);
    }
    if (
      typeof evidence.kind !== "string" ||
      !includes(BADGE_EVIDENCE_KINDS, evidence.kind)
    ) {
      errors.push(`${prefix} kind is unsupported`);
    }
    validateStableId(evidence.subjectId, `${prefix} subject ID`, errors);
    validateVersion(
      evidence.subjectVersion,
      `${prefix} subject version`,
      errors,
    );
    validateVersion(
      evidence.contentVersion,
      `${prefix} content version`,
      errors,
    );
    if (
      typeof evidence.result !== "string" ||
      !includes(BADGE_EVIDENCE_RESULTS, evidence.result)
    ) {
      errors.push(`${prefix} result is unsupported`);
    }
    if (
      typeof evidence.kind === "string" &&
      includes(BADGE_EVIDENCE_KINDS, evidence.kind) &&
      evidence.result !== evidenceResultByKind[evidence.kind]
    ) {
      errors.push(`${prefix} result does not match its evidence kind`);
    }
    validateScore(evidence.scorePercent, `${prefix} score`, errors);
    if (
      evidence.scorePercent !== null &&
      evidence.kind !== "assessment.passed" &&
      evidence.kind !== "capstone.passed"
    ) {
      errors.push(`${prefix} can only score assessments or capstones`);
    }
    validateTimestamp(evidence.occurredAt, `${prefix} occurredAt`, errors);
    if (
      !Array.isArray(evidence.evidenceRefs) ||
      evidence.evidenceRefs.length === 0 ||
      evidence.evidenceRefs.some(
        (reference) =>
          typeof reference !== "string" || !stableIdPattern.test(reference),
      ) ||
      new Set(evidence.evidenceRefs).size !== evidence.evidenceRefs.length
    ) {
      errors.push(
        `${prefix} evidence references must be a non-empty unique stable-ID array`,
      );
    }
  }
}

function validateExpirationPolicy(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("expiration policy must be an object");
    return;
  }
  if (value.kind === "never") {
    rejectUnknownKeys(value, ["kind"], "expiration policy", errors);
    return;
  }
  if (value.kind === "after-days") {
    rejectUnknownKeys(value, ["kind", "days"], "expiration policy", errors);
    if (!Number.isSafeInteger(value.days) || Number(value.days) <= 0) {
      errors.push("expiration days must be a positive safe integer");
    }
    return;
  }
  errors.push("expiration policy kind is unsupported");
}

function validateOpenBadgesBoundary(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("Open Badges mapping boundary must be an object");
    return;
  }
  rejectUnknownKeys(
    value,
    ["targetVersion", "status", "conformanceClaim"],
    "Open Badges mapping boundary",
    errors,
  );
  if (value.targetVersion !== OPEN_BADGES_3_MAPPING_BOUNDARY.targetVersion) {
    errors.push("Open Badges target version must be 3.0");
  }
  if (value.status !== OPEN_BADGES_3_MAPPING_BOUNDARY.status) {
    errors.push(
      "Open Badges status must remain future-mapping-not-conformant",
    );
  }
  if (value.conformanceClaim !== false) {
    errors.push("Open Badges conformance must not be claimed");
  }
}

function validateActor(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("lifecycle actor must be an object");
    return;
  }
  rejectUnknownKeys(value, ["type", "id"], "lifecycle actor", errors);
  if (
    typeof value.type !== "string" ||
    !includes(BADGE_LIFECYCLE_ACTOR_TYPES, value.type)
  ) {
    errors.push("lifecycle actor type is unsupported");
  }
  validateStableId(value.id, "lifecycle actor ID", errors);
}

function assertEvidence(
  definition: BadgeDefinitionV1,
  evidence: readonly BadgeEvidenceV1[],
  credentialId: string,
  availableAt: string,
): void {
  const validation = validateBadgeIssuanceEvidence(definition, evidence);
  if (!validation.valid) {
    throw new BadgeCredentialError(
      "invalid-evidence",
      `Credential ${credentialId}: ${validation.errors.join("; ")}`,
    );
  }
  if (
    evidence.some(
      (item) => Date.parse(item.occurredAt) > Date.parse(availableAt),
    )
  ) {
    throw new BadgeCredentialError(
      "invalid-evidence",
      `Credential ${credentialId}: evidence cannot occur after its lifecycle event.`,
    );
  }
}

function assertExpirationEligible(
  definition: BadgeDefinitionV1,
  projection: BadgeCredentialProjectionV1,
  event: BadgeExpiredEventV1,
): void {
  if (definition.expirationPolicy.kind !== "after-days") {
    throw new BadgeCredentialError(
      "invalid-lifecycle-transition",
      `Credential ${projection.credentialId} does not expire under its definition.`,
    );
  }
  const eligibleAt =
    Date.parse(projection.issuedAt) +
    definition.expirationPolicy.days * 24 * 60 * 60 * 1_000;
  if (Date.parse(event.occurredAt) < eligibleAt) {
    throw new BadgeCredentialError(
      "premature-expiration",
      `Credential ${projection.credentialId} cannot expire before its policy date.`,
    );
  }
}

function definitionKey(id: string, version: string): string {
  return `${id}@${version}`;
}

function validateStableId(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (typeof value !== "string" || !stableIdPattern.test(value)) {
    errors.push(`${label} is invalid`);
  }
}

function validateVersion(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (typeof value !== "string" || !versionPattern.test(value)) {
    errors.push(`${label} is required and invalid`);
  }
}

function validateTimestamp(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (
    typeof value !== "string" ||
    !timestampPattern.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    errors.push(`${label} must be an ISO UTC timestamp`);
  }
}

function validateText(
  value: unknown,
  label: string,
  maxLength: number,
  errors: string[],
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    errors.push(`${label} must be between 1 and ${maxLength} characters`);
  }
}

function validateReason(
  value: unknown,
  label: string,
  errors: string[],
): void {
  validateText(value, label, 1_000, errors);
}

function validateScore(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (
    value !== null &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100)
  ) {
    errors.push(`${label} must be null or a number from 0 through 100`);
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
  errors: string[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${label} contains unsupported field: ${key}`);
    }
  }
}

function includes<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

import type { ValidationResult } from "./schema.js";

export const LEARNING_EVENT_CONTRACT_VERSION = "1.0" as const;

export const LEARNING_COMMAND_TYPES = [
  "path.enroll",
  "module.visit",
  "assessment.record",
  "module.complete",
  "assessment.correct",
] as const;

export const LEARNING_EVENT_TYPES = [
  "path.enrolled",
  "module.visited",
  "assessment.recorded",
  "module.completed",
  "assessment.corrected",
] as const;

export type LearningCommandType = (typeof LEARNING_COMMAND_TYPES)[number];
export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];
export type LearningActorType = "learner" | "owner" | "system";

export interface LearningActor {
  type: LearningActorType;
  userId: string | null;
}

export interface LearningBadgeDefinition {
  id: string;
  name: string;
  description: string;
}

export interface LearningCommandBase {
  schemaVersion: typeof LEARNING_EVENT_CONTRACT_VERSION;
  type: LearningCommandType;
  installationId: string;
  learnerId: string;
  idempotencyKey: string;
  contentVersion: string;
  occurredAt: string;
  actor: LearningActor;
}

export interface EnrollPathCommand extends LearningCommandBase {
  type: "path.enroll";
  payload: {
    pathId: string;
    pathTitle: string;
    moduleIds: string[];
    badge: LearningBadgeDefinition;
  };
}

export interface VisitModuleCommand extends LearningCommandBase {
  type: "module.visit";
  payload: {
    pathId: string;
    moduleId: string;
  };
}

export interface RecordAssessmentCommand extends LearningCommandBase {
  type: "assessment.record";
  payload: {
    attemptId: string;
    pathId: string;
    moduleId: string;
    assessmentVersion: string;
    answers: Record<string, number | null>;
    scorePercent: number;
    passed: boolean;
  };
}

export interface CompleteModuleCommand extends LearningCommandBase {
  type: "module.complete";
  payload: {
    pathId: string;
    moduleId: string;
    evidenceRefs: string[];
  };
}

export interface CorrectAssessmentCommand extends LearningCommandBase {
  type: "assessment.correct";
  payload: {
    correctionId: string;
    attemptId: string;
    assessmentVersion: string;
    scorePercent: number;
    passed: boolean;
    reason: string;
  };
}

export type LearningCommand =
  | EnrollPathCommand
  | VisitModuleCommand
  | RecordAssessmentCommand
  | CompleteModuleCommand
  | CorrectAssessmentCommand;

export interface LearningEventBase {
  schemaVersion: typeof LEARNING_EVENT_CONTRACT_VERSION;
  id: string;
  sequence: number;
  type: LearningEventType;
  installationId: string;
  learnerId: string;
  idempotencyKey: string;
  contentVersion: string;
  commandDigest: string;
  occurredAt: string;
  recordedAt: string;
  actor: LearningActor;
}

export interface PathEnrolledEvent extends LearningEventBase {
  type: "path.enrolled";
  payload: EnrollPathCommand["payload"];
}

export interface ModuleVisitedEvent extends LearningEventBase {
  type: "module.visited";
  payload: VisitModuleCommand["payload"];
}

export interface AssessmentRecordedEvent extends LearningEventBase {
  type: "assessment.recorded";
  payload: RecordAssessmentCommand["payload"];
}

export interface ModuleCompletedEvent extends LearningEventBase {
  type: "module.completed";
  payload: CompleteModuleCommand["payload"];
}

export interface AssessmentCorrectedEvent extends LearningEventBase {
  type: "assessment.corrected";
  payload: CorrectAssessmentCommand["payload"];
}

export type LearningEvent =
  | PathEnrolledEvent
  | ModuleVisitedEvent
  | AssessmentRecordedEvent
  | ModuleCompletedEvent
  | AssessmentCorrectedEvent;

const stableIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function validateLearningCommand(
  value: LearningCommand,
): ValidationResult {
  const errors: string[] = [];
  rejectUnknownKeys(
    value,
    [
      "schemaVersion",
      "type",
      "installationId",
      "learnerId",
      "idempotencyKey",
      "contentVersion",
      "occurredAt",
      "actor",
      "payload",
    ],
    "command",
    errors,
  );
  validateContractVersion(value.schemaVersion, errors);
  if (!LEARNING_COMMAND_TYPES.includes(value.type)) {
    errors.push("command type is unsupported");
    return { valid: false, errors };
  }
  validateStableId(value.installationId, "installation ID", errors);
  validateStableId(value.learnerId, "learner ID", errors);
  if (!idempotencyPattern.test(value.idempotencyKey)) {
    errors.push("idempotency key must contain 16–128 safe characters");
  }
  validateVersion(value.contentVersion, "content version", errors);
  validateTimestamp(value.occurredAt, "command occurredAt", errors);
  validateActor(value.actor, errors);
  validateCommandPayload(value, errors);
  return { valid: errors.length === 0, errors };
}

export function validateLearningEvent(value: LearningEvent): ValidationResult {
  const errors: string[] = [];
  rejectUnknownKeys(
    value,
    [
      "schemaVersion",
      "id",
      "sequence",
      "type",
      "installationId",
      "learnerId",
      "idempotencyKey",
      "contentVersion",
      "commandDigest",
      "occurredAt",
      "recordedAt",
      "actor",
      "payload",
    ],
    "event",
    errors,
  );
  validateContractVersion(value.schemaVersion, errors);
  validateStableId(value.id, "event ID", errors);
  if (!Number.isInteger(value.sequence) || value.sequence < 1) {
    errors.push("event sequence must be a positive integer");
  }
  if (!LEARNING_EVENT_TYPES.includes(value.type)) {
    errors.push("event type is unsupported");
    return { valid: false, errors };
  }
  validateStableId(value.installationId, "installation ID", errors);
  validateStableId(value.learnerId, "learner ID", errors);
  if (!idempotencyPattern.test(value.idempotencyKey)) {
    errors.push("idempotency key must contain 16–128 safe characters");
  }
  validateVersion(value.contentVersion, "content version", errors);
  if (!digestPattern.test(value.commandDigest)) {
    errors.push("command digest must be a lowercase SHA-256 digest");
  }
  validateTimestamp(value.occurredAt, "event occurredAt", errors);
  validateTimestamp(value.recordedAt, "event recordedAt", errors);
  if (
    validTimestamp(value.occurredAt) &&
    validTimestamp(value.recordedAt) &&
    Date.parse(value.recordedAt) < Date.parse(value.occurredAt)
  ) {
    errors.push("event recordedAt cannot precede occurredAt");
  }
  validateActor(value.actor, errors);
  validateEventPayload(value, errors);
  return { valid: errors.length === 0, errors };
}

export function canonicalizeLearningCommand(command: LearningCommand): string {
  const validation = validateLearningCommand(command);
  if (!validation.valid) {
    throw new Error(
      `Invalid learning command: ${validation.errors.join("; ")}`,
    );
  }
  return JSON.stringify(sortJsonValue(command));
}

export async function digestLearningCommand(
  command: LearningCommand,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeLearningCommand(command));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function validateContractVersion(value: string, errors: string[]): void {
  if (value !== LEARNING_EVENT_CONTRACT_VERSION) {
    errors.push(
      `schemaVersion must be ${LEARNING_EVENT_CONTRACT_VERSION}`,
    );
  }
}

function validateActor(actor: LearningActor, errors: string[]): void {
  rejectUnknownKeys(actor, ["type", "userId"], "actor", errors);
  if (!isRecord(actor)) return;
  if (!["learner", "owner", "system"].includes(actor.type)) {
    errors.push("actor type is unsupported");
  }
  if (actor.type === "system") {
    if (actor.userId !== null) {
      errors.push("system actors cannot include a user ID");
    }
  } else if (!actor.userId || !stableIdPattern.test(actor.userId)) {
    errors.push("human actors require a stable user ID");
  }
}

function validateCommandPayload(
  command: LearningCommand,
  errors: string[],
): void {
  switch (command.type) {
    case "path.enroll":
      validatePathPayload(command.payload, errors);
      return;
    case "module.visit":
      validateModulePayload(command.payload, errors);
      return;
    case "assessment.record":
      validateAssessmentPayload(command.payload, errors);
      return;
    case "module.complete":
      validateCompletionPayload(command.payload, errors);
      return;
    case "assessment.correct":
      validateCorrectionPayload(command.payload, errors);
  }
}

function validateEventPayload(
  event: LearningEvent,
  errors: string[],
): void {
  switch (event.type) {
    case "path.enrolled":
      validatePathPayload(event.payload, errors);
      return;
    case "module.visited":
      validateModulePayload(event.payload, errors);
      return;
    case "assessment.recorded":
      validateAssessmentPayload(event.payload, errors);
      return;
    case "module.completed":
      validateCompletionPayload(event.payload, errors);
      return;
    case "assessment.corrected":
      validateCorrectionPayload(event.payload, errors);
  }
}

function validatePathPayload(
  payload: EnrollPathCommand["payload"],
  errors: string[],
): void {
  rejectUnknownKeys(
    payload,
    ["pathId", "pathTitle", "moduleIds", "badge"],
    "path enrollment payload",
    errors,
  );
  if (!isRecord(payload)) return;
  validateStableId(payload.pathId, "path ID", errors);
  validateDisplayText(payload.pathTitle, "path title", errors, 200);
  validateUniqueIds(payload.moduleIds, "path module ID", errors);
  if (payload.moduleIds.length === 0) {
    errors.push("path enrollment requires at least one module");
  }
  rejectUnknownKeys(
    payload.badge,
    ["id", "name", "description"],
    "badge definition",
    errors,
  );
  if (!isRecord(payload.badge)) return;
  validateStableId(payload.badge.id, "badge ID", errors);
  validateDisplayText(payload.badge.name, "badge name", errors, 120);
  validateDisplayText(
    payload.badge.description,
    "badge description",
    errors,
    500,
  );
}

function validateModulePayload(
  payload: VisitModuleCommand["payload"],
  errors: string[],
): void {
  rejectUnknownKeys(
    payload,
    ["pathId", "moduleId"],
    "module visit payload",
    errors,
  );
  if (!isRecord(payload)) return;
  validateStableId(payload.pathId, "path ID", errors);
  validateStableId(payload.moduleId, "module ID", errors);
}

function validateAssessmentPayload(
  payload: RecordAssessmentCommand["payload"],
  errors: string[],
): void {
  rejectUnknownKeys(
    payload,
    [
      "attemptId",
      "pathId",
      "moduleId",
      "assessmentVersion",
      "answers",
      "scorePercent",
      "passed",
    ],
    "assessment payload",
    errors,
  );
  if (!isRecord(payload)) return;
  validateStableId(payload.attemptId, "attempt ID", errors);
  validateStableId(payload.pathId, "path ID", errors);
  validateStableId(payload.moduleId, "module ID", errors);
  validateVersion(
    payload.assessmentVersion,
    "assessment version",
    errors,
  );
  if (!isRecord(payload.answers)) {
    errors.push("assessment answers must be an object");
    return;
  }
  const answerEntries = Object.entries(payload.answers);
  if (answerEntries.length === 0 || answerEntries.length > 500) {
    errors.push("assessment answers must contain 1–500 questions");
  }
  for (const [questionId, answer] of answerEntries) {
    validateStableId(questionId, "question ID", errors);
    if (
      answer !== null &&
      (!Number.isInteger(answer) || answer < 0 || answer > 1_000)
    ) {
      errors.push(
        `assessment answer for ${questionId} must be null or a nonnegative integer`,
      );
    }
  }
  validateScore(payload.scorePercent, errors);
  if (typeof payload.passed !== "boolean") {
    errors.push("assessment passed must be a boolean");
  }
}

function validateCompletionPayload(
  payload: CompleteModuleCommand["payload"],
  errors: string[],
): void {
  rejectUnknownKeys(
    payload,
    ["pathId", "moduleId", "evidenceRefs"],
    "module completion payload",
    errors,
  );
  if (!isRecord(payload)) return;
  validateStableId(payload.pathId, "path ID", errors);
  validateStableId(payload.moduleId, "module ID", errors);
  validateUniqueIds(payload.evidenceRefs, "evidence reference", errors);
  if (payload.evidenceRefs.length === 0) {
    errors.push("module completion requires at least one evidence reference");
  }
}

function validateCorrectionPayload(
  payload: CorrectAssessmentCommand["payload"],
  errors: string[],
): void {
  rejectUnknownKeys(
    payload,
    [
      "correctionId",
      "attemptId",
      "assessmentVersion",
      "scorePercent",
      "passed",
      "reason",
    ],
    "assessment correction payload",
    errors,
  );
  if (!isRecord(payload)) return;
  validateStableId(payload.correctionId, "correction ID", errors);
  validateStableId(payload.attemptId, "attempt ID", errors);
  validateVersion(
    payload.assessmentVersion,
    "assessment version",
    errors,
  );
  validateScore(payload.scorePercent, errors);
  if (typeof payload.passed !== "boolean") {
    errors.push("assessment correction passed must be a boolean");
  }
  validateDisplayText(
    payload.reason,
    "assessment correction reason",
    errors,
    500,
  );
}

function validateScore(value: number, errors: string[]): void {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    errors.push("assessment scorePercent must be an integer from 0–100");
  }
}

function validateStableId(
  value: string,
  label: string,
  errors: string[],
): void {
  if (!stableIdPattern.test(value)) {
    errors.push(`${label} is invalid`);
  }
}

function validateUniqueIds(
  values: string[],
  label: string,
  errors: string[],
): void {
  if (!Array.isArray(values)) {
    errors.push(`${label} collection is required`);
    return;
  }
  const observed = new Set<string>();
  for (const value of values) {
    validateStableId(value, label, errors);
    if (observed.has(value)) errors.push(`duplicate ${label}: ${value}`);
    observed.add(value);
  }
}

function validateVersion(
  value: string,
  label: string,
  errors: string[],
): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value)
  ) {
    errors.push(`${label} is invalid`);
  }
}

function validateDisplayText(
  value: string,
  label: string,
  errors: string[],
  maximumLength: number,
): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > maximumLength
  ) {
    errors.push(`${label} must contain 1–${maximumLength} trimmed characters`);
  }
}

function validateTimestamp(
  value: string,
  label: string,
  errors: string[],
): void {
  if (!validTimestamp(value)) {
    errors.push(`${label} must be an ISO UTC timestamp`);
  }
}

function validTimestamp(value: string): boolean {
  return (
    timestampPattern.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() ===
      (value.includes(".") ? value : value.replace("Z", ".000Z"))
  );
}

function rejectUnknownKeys(
  value: object,
  allowed: string[],
  label: string,
  errors: string[],
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${label} contains unsupported field: ${key}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }
  return value;
}

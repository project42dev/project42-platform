import type { LearnerProgress } from "./progress.js";
import type { ValidationResult } from "./schema.js";

export const LEARNING_EVENT_CONTRACT_VERSION = "1.1" as const;
export const SUPPORTED_LEARNING_EVENT_CONTRACT_VERSIONS = [
  "1.0",
  LEARNING_EVENT_CONTRACT_VERSION,
] as const;
export type LearningEventContractVersion =
  (typeof SUPPORTED_LEARNING_EVENT_CONTRACT_VERSIONS)[number];

export const LEARNING_COMMAND_TYPES = [
  "path.enroll",
  "module.visit",
  "assessment.record",
  "module.complete",
  "assessment.correct",
  "progress.import",
] as const;

export const LEARNING_EVENT_TYPES = [
  "path.enrolled",
  "module.visited",
  "assessment.recorded",
  "module.completed",
  "assessment.corrected",
  "progress.imported",
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
  schemaVersion: LearningEventContractVersion;
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

export type LearningProgressImportSource =
  | "browser-local-v1"
  | "project42-portable-json"
  | "legacy-hosted-v1"
  | "account-merge-v1";

export interface ImportProgressCommand extends LearningCommandBase {
  type: "progress.import";
  schemaVersion: typeof LEARNING_EVENT_CONTRACT_VERSION;
  payload: {
    source: LearningProgressImportSource;
    sourceChecksum: string;
    synchronizedAt: string;
    progress: LearnerProgress;
  };
}

export type LearningCommand =
  | EnrollPathCommand
  | VisitModuleCommand
  | RecordAssessmentCommand
  | CompleteModuleCommand
  | CorrectAssessmentCommand
  | ImportProgressCommand;

export interface LearningEventBase {
  schemaVersion: LearningEventContractVersion;
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

export interface ProgressImportedEvent extends LearningEventBase {
  type: "progress.imported";
  schemaVersion: typeof LEARNING_EVENT_CONTRACT_VERSION;
  payload: ImportProgressCommand["payload"];
}

export type LearningEvent =
  | PathEnrolledEvent
  | ModuleVisitedEvent
  | AssessmentRecordedEvent
  | ModuleCompletedEvent
  | AssessmentCorrectedEvent
  | ProgressImportedEvent;

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
  if (
    value.type === "progress.import" &&
    value.schemaVersion !== LEARNING_EVENT_CONTRACT_VERSION
  ) {
    errors.push(
      `progress import commands require schemaVersion ${LEARNING_EVENT_CONTRACT_VERSION}`,
    );
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
  if (
    value.type === "progress.imported" &&
    value.schemaVersion !== LEARNING_EVENT_CONTRACT_VERSION
  ) {
    errors.push(
      `progress imported events require schemaVersion ${LEARNING_EVENT_CONTRACT_VERSION}`,
    );
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
  if (
    !SUPPORTED_LEARNING_EVENT_CONTRACT_VERSIONS.includes(
      value as LearningEventContractVersion,
    )
  ) {
    errors.push(
      `schemaVersion must be one of ${SUPPORTED_LEARNING_EVENT_CONTRACT_VERSIONS.join(", ")}`,
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
      return;
    case "progress.import":
      validateProgressImportPayload(command.payload, errors);
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
      return;
    case "progress.imported":
      validateProgressImportPayload(event.payload, errors);
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

function validateProgressImportPayload(
  payload: ImportProgressCommand["payload"],
  errors: string[],
): void {
  rejectUnknownKeys(
    payload,
    ["source", "sourceChecksum", "synchronizedAt", "progress"],
    "progress import payload",
    errors,
  );
  if (!isRecord(payload)) return;
  if (
    ![
      "browser-local-v1",
      "project42-portable-json",
      "legacy-hosted-v1",
      "account-merge-v1",
    ].includes(payload.source)
  ) {
    errors.push("progress import source is unsupported");
  }
  if (!digestPattern.test(payload.sourceChecksum)) {
    errors.push(
      "progress import sourceChecksum must be a lowercase SHA-256 digest",
    );
  }
  validateTimestamp(
    payload.synchronizedAt,
    "progress import synchronizedAt",
    errors,
  );
  validateProgressSnapshot(payload.progress, errors);
}

function validateProgressSnapshot(
  progress: LearnerProgress,
  errors: string[],
): void {
  if (!isRecord(progress)) {
    errors.push("progress import progress must be an object");
    return;
  }
  rejectUnknownKeys(
    progress,
    [
      "schemaVersion",
      "displayName",
      "startedPathIds",
      "completedModuleIds",
      "attempts",
      "capstoneSubmissions",
      "badges",
      "recentModule",
      "updatedAt",
    ],
    "progress import progress",
    errors,
  );
  if (
    progress.schemaVersion !== 1 ||
    typeof progress.displayName !== "string" ||
    !Array.isArray(progress.startedPathIds) ||
    !Array.isArray(progress.completedModuleIds) ||
    !Array.isArray(progress.attempts) ||
    !Array.isArray(progress.badges) ||
    (progress.capstoneSubmissions !== undefined &&
      !Array.isArray(progress.capstoneSubmissions))
  ) {
    errors.push("progress import progress must use the Project 42 v1 schema");
    return;
  }
  validateDisplayText(
    progress.displayName,
    "progress display name",
    errors,
    80,
  );
  validateProgressStringArray(
    progress.startedPathIds,
    "started path ID",
    1_000,
    errors,
  );
  validateProgressStringArray(
    progress.completedModuleIds,
    "completed module ID",
    10_000,
    errors,
  );
  validateTimestamp(progress.updatedAt, "progress updatedAt", errors);
  if (
    progress.attempts.length > 10_000 ||
    progress.badges.length > 1_000 ||
    progress.completedModuleIds.length > 10_000 ||
    (progress.capstoneSubmissions?.length ?? 0) > 10_000
  ) {
    errors.push("progress import progress exceeds supported record limits");
  }
  validateUniqueProgressRecords(
    progress.attempts,
    "progress assessment attempt",
    errors,
    validateProgressAttempt,
  );
  validateUniqueProgressRecords(
    progress.capstoneSubmissions ?? [],
    "progress capstone submission",
    errors,
    validateProgressCapstone,
  );
  validateUniqueProgressRecords(
    progress.badges,
    "progress badge",
    errors,
    validateProgressBadge,
  );
  if (progress.recentModule !== undefined) {
    validateProgressRecentModule(progress.recentModule, errors);
  }
}

function validateProgressAttempt(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  rejectUnknownKeys(
    value,
    [
      "id",
      "pathId",
      "moduleId",
      "contentVersion",
      "scorePercent",
      "passed",
      "completedAt",
    ],
    label,
    errors,
  );
  validateProgressString(value.id, `${label} ID`, 128, errors);
  validateProgressString(value.pathId, `${label} path ID`, 128, errors);
  validateProgressString(value.moduleId, `${label} module ID`, 128, errors);
  validateProgressString(
    value.contentVersion,
    `${label} content version`,
    128,
    errors,
  );
  validateProgressScore(value.scorePercent, `${label} score`, errors);
  if (typeof value.passed !== "boolean") {
    errors.push(`${label} passed must be boolean`);
  }
  validateTimestamp(value.completedAt as string, `${label} completedAt`, errors);
}

function validateProgressCapstone(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  rejectUnknownKeys(
    value,
    [
      "id",
      "pathId",
      "moduleId",
      "contentVersion",
      "submittedAt",
      "artifactRefs",
      "criterionScores",
      "scorePercent",
      "passed",
      "reflection",
    ],
    label,
    errors,
  );
  validateProgressString(value.id, `${label} ID`, 128, errors);
  validateProgressString(value.pathId, `${label} path ID`, 128, errors);
  validateProgressString(value.moduleId, `${label} module ID`, 128, errors);
  validateProgressString(
    value.contentVersion,
    `${label} content version`,
    128,
    errors,
  );
  validateTimestamp(value.submittedAt as string, `${label} submittedAt`, errors);
  validateProgressStringArray(
    value.artifactRefs,
    `${label} artifact reference`,
    1_000,
    errors,
  );
  if (!Array.isArray(value.criterionScores) || value.criterionScores.length === 0) {
    errors.push(`${label} criterion scores are required`);
  } else {
    validateUniqueProgressRecords(
      value.criterionScores,
      `${label} criterion score`,
      errors,
      validateProgressCriterionScore,
      "criterionId",
    );
  }
  validateProgressScore(value.scorePercent, `${label} score`, errors);
  if (typeof value.passed !== "boolean") {
    errors.push(`${label} passed must be boolean`);
  }
  validateDisplayText(
    value.reflection as string,
    `${label} reflection`,
    errors,
    10_000,
  );
}

function validateProgressCriterionScore(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  rejectUnknownKeys(
    value,
    ["criterionId", "pointsAwarded", "evidenceRefs"],
    label,
    errors,
  );
  validateProgressString(
    value.criterionId,
    `${label} criterion ID`,
    128,
    errors,
  );
  if (
    !Number.isInteger(value.pointsAwarded) ||
    (value.pointsAwarded as number) < 0
  ) {
    errors.push(`${label} pointsAwarded must be a nonnegative integer`);
  }
  if (value.evidenceRefs !== undefined) {
    validateProgressStringArray(
      value.evidenceRefs,
      `${label} evidence reference`,
      1_000,
      errors,
    );
  }
}

function validateProgressBadge(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  rejectUnknownKeys(
    value,
    ["id", "name", "description", "earnedAt", "evidenceModuleIds"],
    label,
    errors,
  );
  validateProgressString(value.id, `${label} ID`, 128, errors);
  validateDisplayText(value.name as string, `${label} name`, errors, 120);
  validateDisplayText(
    value.description as string,
    `${label} description`,
    errors,
    500,
  );
  validateTimestamp(value.earnedAt as string, `${label} earnedAt`, errors);
  validateProgressStringArray(
    value.evidenceModuleIds,
    `${label} evidence module ID`,
    10_000,
    errors,
  );
}

function validateProgressRecentModule(
  value: unknown,
  errors: string[],
): void {
  const label = "progress recent module";
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  rejectUnknownKeys(value, ["pathId", "moduleId", "visitedAt"], label, errors);
  validateProgressString(value.pathId, `${label} path ID`, 128, errors);
  validateProgressString(value.moduleId, `${label} module ID`, 128, errors);
  validateTimestamp(value.visitedAt as string, `${label} visitedAt`, errors);
}

function validateUniqueProgressRecords(
  values: unknown[],
  label: string,
  errors: string[],
  validate: (value: unknown, label: string, errors: string[]) => void,
  idField = "id",
): void {
  const observed = new Set<string>();
  for (const [index, value] of values.entries()) {
    const itemLabel = `${label} ${index + 1}`;
    validate(value, itemLabel, errors);
    if (!isRecord(value) || typeof value[idField] !== "string") continue;
    const id = value[idField] as string;
    if (observed.has(id)) errors.push(`duplicate ${label} ID: ${id}`);
    observed.add(id);
  }
}

function validateProgressStringArray(
  value: unknown,
  label: string,
  maximumItems: number,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${label} collection is required`);
    return;
  }
  if (value.length > maximumItems) {
    errors.push(`${label} collection exceeds ${maximumItems} items`);
  }
  const observed = new Set<string>();
  for (const item of value) {
    validateProgressString(item, label, 2_048, errors);
    if (typeof item !== "string") continue;
    if (observed.has(item)) errors.push(`duplicate ${label}: ${item}`);
    observed.add(item);
  }
}

function validateProgressString(
  value: unknown,
  label: string,
  maximumLength: number,
  errors: string[],
): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    errors.push(`${label} is invalid`);
  }
}

function validateProgressScore(
  value: unknown,
  label: string,
  errors: string[],
): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    errors.push(`${label} must be a finite number from 0–100`);
  }
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

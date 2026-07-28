import type { LearningEvent } from "./learning-events.js";

export const LEARNING_RECORD_RECEIPT_VERSION = "1.0" as const;

export interface LearningRecordExportReceipt {
  schemaVersion: typeof LEARNING_RECORD_RECEIPT_VERSION;
  receiptType: "learning-record.exported";
  id: string;
  scopeDigest: string;
  sourceRevision: number;
  eventCount: number;
  eventDigest: string;
  exportedAt: string;
  receiptDigest: string;
}

export interface VerifiedLearningRecordExport {
  schemaVersion: typeof LEARNING_RECORD_RECEIPT_VERSION;
  installationId: string;
  learnerId: string;
  events: LearningEvent[];
  receipt: LearningRecordExportReceipt;
}

export interface LearningRecordDeletionReceipt {
  schemaVersion: typeof LEARNING_RECORD_RECEIPT_VERSION;
  receiptType: "learning-record.deleted";
  id: string;
  operationKey: string;
  scopeDigest: string;
  sourceRevision: number;
  eventCount: number;
  eventDigest: string;
  deletedAt: string;
  receiptDigest: string;
}

export interface LearningRecordDeletionReplay {
  schemaVersion: typeof LEARNING_RECORD_RECEIPT_VERSION;
  receiptType: "learning-record.deletion-replayed";
  id: string;
  deletionReceiptId: string;
  restoreId: string;
  scopeDigest: string;
  preReplayRevision: number;
  preReplayEventCount: number;
  preReplayEventDigest: string;
  deletedEventCount: number;
  replayedAt: string;
  receiptDigest: string;
}

export interface LearningRecordReceiptValidation {
  valid: boolean;
  errors: string[];
}

export interface LearningRecordReceiptStore {
  exportVerified(
    installationId: string,
    learnerId: string,
    exportedAt: string,
  ): Promise<VerifiedLearningRecordExport>;
  deleteVerified(
    installationId: string,
    learnerId: string,
    operationKey: string,
    deletedAt: string,
  ): Promise<LearningRecordDeletionReceipt>;
  replayDeletion(
    installationId: string,
    learnerId: string,
    deletionReceipt: LearningRecordDeletionReceipt,
    restoreId: string,
    replayedAt: string,
  ): Promise<LearningRecordDeletionReplay>;
}

export async function createVerifiedLearningRecordExport(
  installationId: string,
  learnerId: string,
  events: LearningEvent[],
  exportedAt: string,
): Promise<VerifiedLearningRecordExport> {
  assertScope(installationId, learnerId, events);
  assertTimestamp(exportedAt, "exportedAt");
  const scopeDigest = await digestLearningRecordScope(
    installationId,
    learnerId,
  );
  const eventDigest = await digestLearningEvents(events);
  const payload = {
    schemaVersion: LEARNING_RECORD_RECEIPT_VERSION,
    receiptType: "learning-record.exported" as const,
    scopeDigest,
    sourceRevision: events.length,
    eventCount: events.length,
    eventDigest,
    exportedAt,
  };
  const receiptDigest = await digestJson(payload);
  return {
    schemaVersion: LEARNING_RECORD_RECEIPT_VERSION,
    installationId,
    learnerId,
    events: structuredClone(events),
    receipt: {
      ...payload,
      id: `learning-export-${receiptDigest.slice(0, 32)}`,
      receiptDigest,
    },
  };
}

export async function createLearningRecordDeletionReceipt(
  installationId: string,
  learnerId: string,
  events: LearningEvent[],
  operationKey: string,
  deletedAt: string,
): Promise<LearningRecordDeletionReceipt> {
  assertScope(installationId, learnerId, events);
  if (!validOperationKey(operationKey)) {
    throw new Error("operationKey must contain 16-128 safe characters.");
  }
  assertTimestamp(deletedAt, "deletedAt");
  const payload = {
    schemaVersion: LEARNING_RECORD_RECEIPT_VERSION,
    receiptType: "learning-record.deleted" as const,
    operationKey,
    scopeDigest: await digestLearningRecordScope(
      installationId,
      learnerId,
    ),
    sourceRevision: events.length,
    eventCount: events.length,
    eventDigest: await digestLearningEvents(events),
    deletedAt,
  };
  const receiptDigest = await digestJson(payload);
  return {
    ...payload,
    id: `learning-deletion-${receiptDigest.slice(0, 32)}`,
    receiptDigest,
  };
}

export async function createLearningRecordDeletionReplay(
  deletionReceipt: LearningRecordDeletionReceipt,
  restoreId: string,
  restoredEvents: LearningEvent[],
  deletedEventCount: number,
  replayedAt: string,
): Promise<LearningRecordDeletionReplay> {
  const validation = await verifyLearningRecordDeletionReceipt(
    deletionReceipt,
  );
  if (!validation.valid) {
    throw new Error(
      `Invalid learning-record deletion receipt: ${validation.errors.join("; ")}`,
    );
  }
  if (!validIdentifier(restoreId)) {
    throw new Error("restoreId must contain 3-128 safe characters.");
  }
  assertTimestamp(replayedAt, "replayedAt");
  if (
    !Number.isSafeInteger(deletedEventCount) ||
    deletedEventCount < 0 ||
    deletedEventCount !== restoredEvents.length
  ) {
    throw new Error(
      "deletedEventCount must equal the restored event count removed by replay.",
    );
  }
  const payload = {
    schemaVersion: LEARNING_RECORD_RECEIPT_VERSION,
    receiptType: "learning-record.deletion-replayed" as const,
    deletionReceiptId: deletionReceipt.id,
    restoreId,
    scopeDigest: deletionReceipt.scopeDigest,
    preReplayRevision: restoredEvents.length,
    preReplayEventCount: restoredEvents.length,
    preReplayEventDigest: await digestLearningEvents(restoredEvents),
    deletedEventCount,
    replayedAt,
  };
  const receiptDigest = await digestJson(payload);
  return {
    ...payload,
    id: `learning-replay-${receiptDigest.slice(0, 32)}`,
    receiptDigest,
  };
}

export async function verifyLearningRecordExport(
  value: VerifiedLearningRecordExport,
): Promise<LearningRecordReceiptValidation> {
  const errors: string[] = [];
  if (value.schemaVersion !== LEARNING_RECORD_RECEIPT_VERSION) {
    errors.push("unsupported export schemaVersion");
  }
  try {
    assertScope(value.installationId, value.learnerId, value.events);
  } catch (error) {
    errors.push(errorMessage(error));
  }
  const scopeDigest = await digestLearningRecordScope(
    value.installationId,
    value.learnerId,
  );
  if (value.receipt.scopeDigest !== scopeDigest) {
    errors.push("scopeDigest does not match the exported learner scope");
  }
  const eventDigest = await digestLearningEvents(value.events);
  if (value.receipt.eventDigest !== eventDigest) {
    errors.push("eventDigest does not match the exported events");
  }
  if (
    value.receipt.eventCount !== value.events.length ||
    value.receipt.sourceRevision !== value.events.length
  ) {
    errors.push("event count or source revision does not match the export");
  }
  errors.push(...(await validateExportReceipt(value.receipt)));
  return { valid: errors.length === 0, errors };
}

export async function verifyLearningRecordDeletionReceipt(
  value: LearningRecordDeletionReceipt,
  sourceEvents?: LearningEvent[],
): Promise<LearningRecordReceiptValidation> {
  const errors = await validateDeletionReceipt(value);
  if (sourceEvents) {
    if (
      value.eventCount !== sourceEvents.length ||
      value.sourceRevision !== sourceEvents.length
    ) {
      errors.push("event count or source revision does not match source events");
    }
    if (value.eventDigest !== (await digestLearningEvents(sourceEvents))) {
      errors.push("eventDigest does not match source events");
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function verifyLearningRecordDeletionReplay(
  value: LearningRecordDeletionReplay,
): Promise<LearningRecordReceiptValidation> {
  const errors: string[] = [];
  if (
    value.schemaVersion !== LEARNING_RECORD_RECEIPT_VERSION ||
    value.receiptType !== "learning-record.deletion-replayed"
  ) {
    errors.push("unsupported deletion replay receipt");
  }
  for (const [name, identifier] of [
    ["id", value.id],
    ["deletionReceiptId", value.deletionReceiptId],
    ["restoreId", value.restoreId],
  ] as const) {
    if (!validIdentifier(identifier)) errors.push(`invalid ${name}`);
  }
  if (!HEX_DIGEST.test(value.scopeDigest)) errors.push("invalid scopeDigest");
  if (!HEX_DIGEST.test(value.preReplayEventDigest)) {
    errors.push("invalid preReplayEventDigest");
  }
  if (!validTimestamp(value.replayedAt)) errors.push("invalid replayedAt");
  if (
    !validCount(value.preReplayRevision) ||
    !validCount(value.preReplayEventCount) ||
    !validCount(value.deletedEventCount) ||
    value.preReplayRevision !== value.preReplayEventCount ||
    value.deletedEventCount !== value.preReplayEventCount
  ) {
    errors.push("invalid replay counts");
  }
  const payload = omitReceiptIdentity(value);
  const expectedDigest = await digestJson(payload);
  if (value.receiptDigest !== expectedDigest) {
    errors.push("receiptDigest does not match replay metadata");
  }
  if (value.id !== `learning-replay-${expectedDigest.slice(0, 32)}`) {
    errors.push("replay receipt id does not match receiptDigest");
  }
  return { valid: errors.length === 0, errors };
}

export async function digestLearningRecordScope(
  installationId: string,
  learnerId: string,
): Promise<string> {
  if (!validIdentifier(installationId) || !validIdentifier(learnerId)) {
    throw new Error(
      "Learning-record installationId and learnerId must contain 3-128 safe characters.",
    );
  }
  return digestText(
    `${LEARNING_RECORD_RECEIPT_VERSION}\u0000${installationId}\u0000${learnerId}`,
  );
}

export async function digestLearningEvents(
  events: LearningEvent[],
): Promise<string> {
  return digestJson(events);
}

async function validateExportReceipt(
  value: LearningRecordExportReceipt,
): Promise<string[]> {
  const errors = validateCommonReceipt(
    value,
    "learning-record.exported",
    "exportedAt",
  );
  const expectedDigest = await digestJson(omitReceiptIdentity(value));
  if (value.receiptDigest !== expectedDigest) {
    errors.push("receiptDigest does not match export metadata");
  }
  if (value.id !== `learning-export-${expectedDigest.slice(0, 32)}`) {
    errors.push("export receipt id does not match receiptDigest");
  }
  return errors;
}

async function validateDeletionReceipt(
  value: LearningRecordDeletionReceipt,
): Promise<string[]> {
  const errors = validateCommonReceipt(
    value,
    "learning-record.deleted",
    "deletedAt",
  );
  const expectedDigest = await digestJson(omitReceiptIdentity(value));
  if (value.receiptDigest !== expectedDigest) {
    errors.push("receiptDigest does not match deletion metadata");
  }
  if (value.id !== `learning-deletion-${expectedDigest.slice(0, 32)}`) {
    errors.push("deletion receipt id does not match receiptDigest");
  }
  return errors;
}

function validateCommonReceipt(
  value: LearningRecordExportReceipt | LearningRecordDeletionReceipt,
  type: LearningRecordExportReceipt["receiptType"] |
    LearningRecordDeletionReceipt["receiptType"],
  timestampField: "exportedAt" | "deletedAt",
): string[] {
  const errors: string[] = [];
  if (
    value.schemaVersion !== LEARNING_RECORD_RECEIPT_VERSION ||
    value.receiptType !== type
  ) {
    errors.push(`unsupported ${type} receipt`);
  }
  if (!validIdentifier(value.id)) errors.push("invalid receipt id");
  if (
    value.receiptType === "learning-record.deleted" &&
    !validOperationKey(value.operationKey)
  ) {
    errors.push("invalid operationKey");
  }
  if (!HEX_DIGEST.test(value.scopeDigest)) errors.push("invalid scopeDigest");
  if (!HEX_DIGEST.test(value.eventDigest)) errors.push("invalid eventDigest");
  if (
    !validCount(value.sourceRevision) ||
    !validCount(value.eventCount) ||
    value.sourceRevision !== value.eventCount
  ) {
    errors.push("invalid event count or source revision");
  }
  const timestamp =
    timestampField === "exportedAt"
      ? (value as LearningRecordExportReceipt).exportedAt
      : (value as LearningRecordDeletionReceipt).deletedAt;
  if (!validTimestamp(timestamp)) {
    errors.push(`invalid ${timestampField}`);
  }
  return errors;
}

function assertScope(
  installationId: string,
  learnerId: string,
  events: LearningEvent[],
): void {
  if (!validIdentifier(installationId) || !validIdentifier(learnerId)) {
    throw new Error("Invalid learning-record installation or learner scope.");
  }
  let previousSequence = 0;
  for (const event of events) {
    if (
      event.installationId !== installationId ||
      event.learnerId !== learnerId
    ) {
      throw new Error("A learning event crossed the exported learner scope.");
    }
    if (
      !Number.isSafeInteger(event.sequence) ||
      event.sequence <= previousSequence
    ) {
      throw new Error("Learning event sequence is not strictly increasing.");
    }
    previousSequence = event.sequence;
  }
}

function omitReceiptIdentity<
  Value extends
    | LearningRecordExportReceipt
    | LearningRecordDeletionReceipt
    | LearningRecordDeletionReplay,
>(value: Value): Omit<Value, "id" | "receiptDigest"> {
  const { id: _id, receiptDigest: _receiptDigest, ...payload } = value;
  return payload;
}

async function digestJson(value: unknown): Promise<string> {
  return digestText(JSON.stringify(sortJsonValue(value)));
}

async function digestText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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

function validIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/.test(value);
}

function validOperationKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{15,127}$/.test(value);
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function assertTimestamp(value: string, name: string): void {
  if (!validTimestamp(value)) {
    throw new Error(`${name} must be an ISO UTC timestamp.`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const HEX_DIGEST = /^[a-f0-9]{64}$/;

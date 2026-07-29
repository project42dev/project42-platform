import type { LearningRecordAdapterKind } from "./learning-record-adapter.js";
import {
  type VerifiedLearningRecordExport,
  verifyLearningRecordExport,
} from "./learning-record-receipts.js";

export const LEARNING_RECORD_RECOVERY_BACKUP_VERSION = "1.0" as const;

export interface LearningRecordRecoveryBackupPayload {
  schemaVersion: typeof LEARNING_RECORD_RECOVERY_BACKUP_VERSION;
  streams: VerifiedLearningRecordExport[];
}

export interface LearningRecordRecoveryBackupManifest {
  schemaVersion: typeof LEARNING_RECORD_RECOVERY_BACKUP_VERSION;
  backupId: string;
  adapter: LearningRecordAdapterKind;
  migrationHead: string;
  capturedAt: string;
  sourceCurrentAt: string;
  streamCount: number;
  eventCount: number;
  payloadBytes: number;
  payloadSha256: string;
}

export interface LearningRecordRecoveryBackupArtifact {
  schemaVersion: typeof LEARNING_RECORD_RECOVERY_BACKUP_VERSION;
  manifest: LearningRecordRecoveryBackupManifest;
  payload: string;
}

export interface LearningRecordRecoveryBackupExpectation {
  adapter: LearningRecordAdapterKind;
  migrationHead: string;
}

export async function createLearningRecordRecoveryBackup(
  streams: VerifiedLearningRecordExport[],
  input: {
    adapter: LearningRecordAdapterKind;
    migrationHead: string;
    capturedAt: string;
    sourceCurrentAt: string;
  },
): Promise<LearningRecordRecoveryBackupArtifact> {
  assertAdapter(input.adapter);
  assertMigrationHead(input.migrationHead);
  const capturedAt = timestamp(input.capturedAt, "capturedAt");
  const sourceCurrentAt = timestamp(input.sourceCurrentAt, "sourceCurrentAt");
  if (sourceCurrentAt < capturedAt) {
    throw new Error("sourceCurrentAt must not precede capturedAt.");
  }
  if (streams.length === 0) {
    throw new Error("A recovery backup requires at least one learner stream.");
  }
  await validateStreams(streams, input.capturedAt);
  const payload = JSON.stringify({
    schemaVersion: LEARNING_RECORD_RECOVERY_BACKUP_VERSION,
    streams,
  } satisfies LearningRecordRecoveryBackupPayload);
  const payloadBytes = new TextEncoder().encode(payload).byteLength;
  const payloadSha256 = await sha256(payload);
  const eventCount = streams.reduce(
    (total, stream) => total + stream.events.length,
    0,
  );
  return {
    schemaVersion: LEARNING_RECORD_RECOVERY_BACKUP_VERSION,
    manifest: {
      schemaVersion: LEARNING_RECORD_RECOVERY_BACKUP_VERSION,
      backupId: `learning-recovery-${payloadSha256.slice(0, 32)}`,
      adapter: input.adapter,
      migrationHead: input.migrationHead,
      capturedAt: input.capturedAt,
      sourceCurrentAt: input.sourceCurrentAt,
      streamCount: streams.length,
      eventCount,
      payloadBytes,
      payloadSha256,
    },
    payload,
  };
}

export async function verifyLearningRecordRecoveryBackup(
  value: unknown,
  expected: LearningRecordRecoveryBackupExpectation,
): Promise<{
  manifest: LearningRecordRecoveryBackupManifest;
  streams: VerifiedLearningRecordExport[];
}> {
  assertAdapter(expected.adapter);
  assertMigrationHead(expected.migrationHead);
  const artifact = readArtifact(value);
  const { manifest } = artifact;
  if (manifest.adapter !== expected.adapter) {
    throw new Error(
      `Recovery backup adapter ${manifest.adapter} does not match expected ${expected.adapter}.`,
    );
  }
  if (manifest.migrationHead !== expected.migrationHead) {
    throw new Error(
      `Recovery backup migration head ${manifest.migrationHead} does not match expected ${expected.migrationHead}.`,
    );
  }
  const payloadBytes = new TextEncoder().encode(artifact.payload).byteLength;
  if (payloadBytes !== manifest.payloadBytes) {
    throw new Error(
      "Recovery backup payload byte count does not match its manifest.",
    );
  }
  const payloadSha256 = await sha256(artifact.payload);
  if (payloadSha256 !== manifest.payloadSha256) {
    throw new Error(
      "Recovery backup payload checksum does not match its manifest.",
    );
  }
  if (
    manifest.backupId !==
    `learning-recovery-${manifest.payloadSha256.slice(0, 32)}`
  ) {
    throw new Error("Recovery backup id does not match its payload checksum.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(artifact.payload);
  } catch {
    throw new Error("Recovery backup payload is truncated or invalid JSON.");
  }
  const payload = readPayload(parsed);
  if (payload.streams.length !== manifest.streamCount) {
    throw new Error(
      "Recovery backup stream count does not match its manifest.",
    );
  }
  const eventCount = payload.streams.reduce(
    (total, stream) => total + stream.events.length,
    0,
  );
  if (eventCount !== manifest.eventCount) {
    throw new Error(
      "Recovery backup event count does not match its manifest.",
    );
  }
  await validateStreams(payload.streams, manifest.capturedAt);
  return {
    manifest: structuredClone(manifest),
    streams: structuredClone(payload.streams),
  };
}

function readArtifact(value: unknown): LearningRecordRecoveryBackupArtifact {
  if (!isObject(value)) {
    throw new Error("Recovery backup artifact must be an object.");
  }
  if (
    value.schemaVersion !== LEARNING_RECORD_RECOVERY_BACKUP_VERSION ||
    !isObject(value.manifest) ||
    typeof value.payload !== "string"
  ) {
    throw new Error("Recovery backup artifact has an unsupported shape.");
  }
  const manifest = value.manifest;
  if (
    manifest.schemaVersion !== LEARNING_RECORD_RECOVERY_BACKUP_VERSION ||
    typeof manifest.backupId !== "string" ||
    typeof manifest.adapter !== "string" ||
    typeof manifest.migrationHead !== "string" ||
    typeof manifest.capturedAt !== "string" ||
    typeof manifest.sourceCurrentAt !== "string" ||
    typeof manifest.streamCount !== "number" ||
    typeof manifest.eventCount !== "number" ||
    typeof manifest.payloadBytes !== "number" ||
    typeof manifest.payloadSha256 !== "string"
  ) {
    throw new Error("Recovery backup manifest has an unsupported shape.");
  }
  assertAdapter(manifest.adapter);
  assertMigrationHead(manifest.migrationHead);
  const capturedAt = timestamp(manifest.capturedAt, "capturedAt");
  const sourceCurrentAt = timestamp(
    manifest.sourceCurrentAt,
    "sourceCurrentAt",
  );
  if (sourceCurrentAt < capturedAt) {
    throw new Error("sourceCurrentAt must not precede capturedAt.");
  }
  for (const [name, count] of [
    ["streamCount", manifest.streamCount],
    ["eventCount", manifest.eventCount],
    ["payloadBytes", manifest.payloadBytes],
  ] as const) {
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
  }
  if (!/^learning-recovery-[a-f0-9]{32}$/.test(manifest.backupId)) {
    throw new Error("Recovery backup id is invalid.");
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.payloadSha256)) {
    throw new Error("Recovery backup payload checksum is invalid.");
  }
  return {
    schemaVersion: LEARNING_RECORD_RECOVERY_BACKUP_VERSION,
    manifest: manifest as unknown as LearningRecordRecoveryBackupManifest,
    payload: value.payload,
  };
}

function readPayload(value: unknown): LearningRecordRecoveryBackupPayload {
  if (
    !isObject(value) ||
    value.schemaVersion !== LEARNING_RECORD_RECOVERY_BACKUP_VERSION ||
    !Array.isArray(value.streams)
  ) {
    throw new Error("Recovery backup payload has an unsupported shape.");
  }
  return {
    schemaVersion: LEARNING_RECORD_RECOVERY_BACKUP_VERSION,
    streams: value.streams as VerifiedLearningRecordExport[],
  };
}

async function validateStreams(
  streams: VerifiedLearningRecordExport[],
  capturedAt: string,
): Promise<void> {
  const scopes = new Set<string>();
  for (const stream of streams) {
    if (!isObject(stream) || !isObject(stream.receipt)) {
      throw new Error("Recovery backup contains an invalid learner stream.");
    }
    const validation = await verifyLearningRecordExport(stream);
    if (!validation.valid) {
      throw new Error(
        `Recovery backup stream verification failed: ${validation.errors.join("; ")}`,
      );
    }
    if (Date.parse(stream.receipt.exportedAt) > Date.parse(capturedAt)) {
      throw new Error(
        "Recovery backup contains a stream exported after capture.",
      );
    }
    if (scopes.has(stream.receipt.scopeDigest)) {
      throw new Error("Recovery backup contains a duplicate learner scope.");
    }
    scopes.add(stream.receipt.scopeDigest);
  }
}

function assertAdapter(value: string): asserts value is LearningRecordAdapterKind {
  if (value !== "cloudflare-d1" && value !== "postgresql") {
    throw new Error("Recovery backup adapter is unsupported.");
  }
}

function assertMigrationHead(value: string): void {
  if (!/^\d{3,4}_[a-z0-9_-]+\.sql$/.test(value)) {
    throw new Error("Recovery backup migration head is invalid.");
  }
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(parsed)
  ) {
    throw new Error(`${name} must be a valid ISO UTC timestamp.`);
  }
  return parsed;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

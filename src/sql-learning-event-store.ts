import {
  LearningEventEngineError,
  type LearningEventAppendResult,
  type LearningEventCandidate,
  type LearningEventStore,
} from "./learning-event-engine.js";
import {
  type LearningEvent,
  validateLearningEvent,
} from "./learning-events.js";
import {
  createLearningRecordDeletionReceipt,
  createLearningRecordDeletionReplay,
  createVerifiedLearningRecordExport,
  digestLearningRecordScope,
  type LearningRecordDeletionReceipt,
  type LearningRecordDeletionReplay,
  type LearningRecordReceiptStore,
  type VerifiedLearningRecordExport,
  verifyLearningRecordDeletionReceipt,
} from "./learning-record-receipts.js";

type SqlValue =
  | null
  | string
  | number
  | boolean
  | ArrayBuffer
  | ArrayBufferView;

export interface LearningEventPreparedStatement {
  bind(...values: SqlValue[]): LearningEventPreparedStatement;
  first<Row = Record<string, unknown>>(): Promise<Row | null>;
  all<Row = Record<string, unknown>>(): Promise<{
    results: Row[];
    success: boolean;
    meta: { changes?: number };
  }>;
  run(): Promise<{
    success: boolean;
    meta: { changes?: number };
  }>;
}

export interface LearningEventDatabase {
  prepare(sql: string): LearningEventPreparedStatement;
  batch(
    statements: LearningEventPreparedStatement[],
  ): Promise<Array<{ success: boolean; meta: { changes?: number } }>>;
}

interface LearningEventRow {
  sequence: number | string;
  id: string;
  installation_id: string;
  user_id: string;
  idempotency_key: string;
  event_type: LearningEvent["type"];
  content_version: string;
  command_digest: string;
  occurred_at: string;
  recorded_at: string;
  actor_type: LearningEvent["actor"]["type"];
  actor_user_id: string | null;
  payload_json: string;
  append_token: string;
}

interface LearningRecordDeletionReceiptRow {
  id: string;
  operation_key: string;
  scope_digest: string;
  source_revision: number | string;
  event_count: number | string;
  event_digest: string;
  deleted_at: string;
  receipt_digest: string;
}

interface LearningRecordDeletionReplayRow {
  id: string;
  deletion_receipt_id: string;
  restore_id: string;
  scope_digest: string;
  pre_replay_revision: number | string;
  pre_replay_event_count: number | string;
  pre_replay_event_digest: string;
  deleted_event_count: number | string;
  replayed_at: string;
  receipt_digest: string;
}

export class SqlLearningEventStore
  implements LearningEventStore, LearningRecordReceiptStore
{
  constructor(private readonly database: LearningEventDatabase) {}

  async append(
    candidate: LearningEventCandidate,
    expectedRevision: number,
  ): Promise<LearningEventAppendResult> {
    const existing = await this.findByIdempotencyKey(
      candidate.installationId,
      candidate.learnerId,
      candidate.idempotencyKey,
    );
    if (existing) return compareIdempotent(existing, candidate);

    const appendToken = crypto.randomUUID();
    const attemptId =
      candidate.type === "assessment.recorded"
        ? candidate.payload.attemptId
        : null;
    const correctionId =
      candidate.type === "assessment.corrected"
        ? candidate.payload.correctionId
        : null;
    try {
      await this.database.batch([
        this.database
          .prepare(
            `INSERT INTO learning_event_streams (
               installation_id, user_id, revision, write_token, updated_at
             ) VALUES (?, ?, 0, NULL, ?)
             ON CONFLICT (installation_id, user_id) DO NOTHING`,
          )
          .bind(
            candidate.installationId,
            candidate.learnerId,
            candidate.recordedAt,
          ),
        this.database
          .prepare(
            `UPDATE learning_event_streams
                SET revision = revision + 1, write_token = ?, updated_at = ?
              WHERE installation_id = ? AND user_id = ? AND revision = ?`,
          )
          .bind(
            appendToken,
            candidate.recordedAt,
            candidate.installationId,
            candidate.learnerId,
            expectedRevision,
          ),
        this.database
          .prepare(
            `INSERT INTO learning_events (
               id, installation_id, user_id, idempotency_key, event_type,
               content_version, command_digest, occurred_at, recorded_at,
               actor_type, actor_user_id, payload_json, assessment_attempt_id,
               assessment_correction_id, append_token
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE EXISTS (
                SELECT 1 FROM learning_event_streams
                 WHERE installation_id = ? AND user_id = ?
                   AND revision = ? AND write_token = ?
              )`,
          )
          .bind(
            candidate.id,
            candidate.installationId,
            candidate.learnerId,
            candidate.idempotencyKey,
            candidate.type,
            candidate.contentVersion,
            candidate.commandDigest,
            candidate.occurredAt,
            candidate.recordedAt,
            candidate.actor.type,
            candidate.actor.userId,
            JSON.stringify(candidate.payload),
            attemptId,
            correctionId,
            appendToken,
            candidate.installationId,
            candidate.learnerId,
            expectedRevision + 1,
            appendToken,
          ),
      ]);
    } catch (error) {
      const concurrent = await this.findByIdempotencyKey(
        candidate.installationId,
        candidate.learnerId,
        candidate.idempotencyKey,
      );
      if (concurrent) return compareIdempotent(concurrent, candidate);
      await this.throwDuplicateEvidence(candidate, error);
      throw error;
    }

    const stored = await this.findByIdempotencyKey(
      candidate.installationId,
      candidate.learnerId,
      candidate.idempotencyKey,
    );
    if (!stored) {
      await this.throwDuplicateEvidence(candidate);
      throw new LearningEventEngineError(
        "concurrency-conflict",
        "The learner event stream changed before the SQL append committed.",
      );
    }
    if (stored.event.commandDigest !== candidate.commandDigest) {
      throw new LearningEventEngineError(
        "idempotency-conflict",
        "The idempotency key is already bound to another learning command.",
      );
    }
    return {
      event: stored.event,
      replayed: stored.appendToken !== appendToken,
    };
  }

  async list(
    installationId: string,
    learnerId: string,
  ): Promise<LearningEvent[]> {
    const rows = await this.database
      .prepare(
        `SELECT sequence, id, installation_id, user_id, idempotency_key,
                event_type, content_version, command_digest, occurred_at,
                recorded_at, actor_type, actor_user_id, payload_json,
                append_token
           FROM learning_events
          WHERE installation_id = ? AND user_id = ?
          ORDER BY sequence ASC`,
      )
      .bind(installationId, learnerId)
      .all<LearningEventRow>();
    return rows.results.map(mapEventRow);
  }

  async delete(
    installationId: string,
    learnerId: string,
  ): Promise<number> {
    const count = await this.database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM learning_events
          WHERE installation_id = ? AND user_id = ?`,
      )
      .bind(installationId, learnerId)
      .first<{ count: number | string }>();
    await this.database.batch([
      this.database
        .prepare(
          `DELETE FROM learning_events
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(installationId, learnerId),
      this.database
        .prepare(
          `DELETE FROM learning_event_streams
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(installationId, learnerId),
    ]);
    return Number(count?.count ?? 0);
  }

  async exportVerified(
    installationId: string,
    learnerId: string,
    exportedAt: string,
  ): Promise<VerifiedLearningRecordExport> {
    const events = await this.list(installationId, learnerId);
    const exported = await createVerifiedLearningRecordExport(
      installationId,
      learnerId,
      events,
      exportedAt,
    );
    const observed = await this.list(installationId, learnerId);
    if (
      observed.length !== events.length ||
      observed.some((event, index) => event.id !== events[index]?.id)
    ) {
      throw new LearningEventEngineError(
        "concurrency-conflict",
        "The learner event stream changed while the verified export was created.",
      );
    }
    return exported;
  }

  async deleteVerified(
    installationId: string,
    learnerId: string,
    operationKey: string,
    deletedAt: string,
  ): Promise<LearningRecordDeletionReceipt> {
    const scopeDigest = await digestLearningRecordScope(
      installationId,
      learnerId,
    );
    const existing = await this.findDeletionReceiptByOperation(
      scopeDigest,
      operationKey,
    );
    if (existing) return existing;

    const events = await this.list(installationId, learnerId);
    const receipt = await createLearningRecordDeletionReceipt(
      installationId,
      learnerId,
      events,
      operationKey,
      deletedAt,
    );
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO learning_record_deletion_receipts (
             id, operation_key, scope_digest, source_revision, event_count,
             event_digest, deleted_at, receipt_digest
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
            WHERE (
              EXISTS (
                SELECT 1 FROM learning_event_streams
                 WHERE installation_id = ? AND user_id = ? AND revision = ?
              )
              OR (
                ? = 0 AND NOT EXISTS (
                  SELECT 1 FROM learning_event_streams
                   WHERE installation_id = ? AND user_id = ?
                )
              )
            )
           ON CONFLICT (scope_digest, operation_key) DO NOTHING`,
        )
        .bind(
          receipt.id,
          receipt.operationKey,
          receipt.scopeDigest,
          receipt.sourceRevision,
          receipt.eventCount,
          receipt.eventDigest,
          receipt.deletedAt,
          receipt.receiptDigest,
          installationId,
          learnerId,
          events.length,
          events.length,
          installationId,
          learnerId,
        ),
      this.database
        .prepare(
          `DELETE FROM learning_events
            WHERE installation_id = ? AND user_id = ?
              AND EXISTS (
                SELECT 1 FROM learning_record_deletion_receipts
                 WHERE id = ?
              )`,
        )
        .bind(installationId, learnerId, receipt.id),
      this.database
        .prepare(
          `DELETE FROM learning_event_streams
            WHERE installation_id = ? AND user_id = ?
              AND EXISTS (
                SELECT 1 FROM learning_record_deletion_receipts
                 WHERE id = ?
              )`,
        )
        .bind(installationId, learnerId, receipt.id),
    ]);
    const stored = await this.findDeletionReceiptByOperation(
      scopeDigest,
      operationKey,
    );
    if (!stored) {
      throw new LearningEventEngineError(
        "concurrency-conflict",
        "The learner event stream changed before verified deletion committed.",
      );
    }
    if (stored.receiptDigest !== receipt.receiptDigest) {
      throw new LearningEventEngineError(
        "idempotency-conflict",
        "The deletion operation key is already bound to different evidence.",
      );
    }
    return stored;
  }

  async replayDeletion(
    installationId: string,
    learnerId: string,
    deletionReceipt: LearningRecordDeletionReceipt,
    restoreId: string,
    replayedAt: string,
  ): Promise<LearningRecordDeletionReplay> {
    const validation = await verifyLearningRecordDeletionReceipt(
      deletionReceipt,
    );
    if (!validation.valid) {
      throw new Error(
        `Invalid deletion receipt: ${validation.errors.join("; ")}`,
      );
    }
    const scopeDigest = await digestLearningRecordScope(
      installationId,
      learnerId,
    );
    if (deletionReceipt.scopeDigest !== scopeDigest) {
      throw new LearningEventEngineError(
        "access-denied",
        "The deletion receipt does not belong to this learner scope.",
      );
    }
    const priorReplay = await this.findDeletionReplay(
      deletionReceipt.id,
      restoreId,
    );
    if (priorReplay) return priorReplay;

    const priorReceipt = await this.findDeletionReceiptByOperation(
      deletionReceipt.scopeDigest,
      deletionReceipt.operationKey,
    );
    if (
      priorReceipt &&
      priorReceipt.receiptDigest !== deletionReceipt.receiptDigest
    ) {
      throw new LearningEventEngineError(
        "idempotency-conflict",
        "The deletion operation key is bound to another receipt.",
      );
    }
    const events = await this.list(installationId, learnerId);
    const replay = await createLearningRecordDeletionReplay(
      deletionReceipt,
      restoreId,
      events,
      events.length,
      replayedAt,
    );
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO learning_record_deletion_receipts (
             id, operation_key, scope_digest, source_revision, event_count,
             event_digest, deleted_at, receipt_digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO NOTHING`,
        )
        .bind(
          deletionReceipt.id,
          deletionReceipt.operationKey,
          deletionReceipt.scopeDigest,
          deletionReceipt.sourceRevision,
          deletionReceipt.eventCount,
          deletionReceipt.eventDigest,
          deletionReceipt.deletedAt,
          deletionReceipt.receiptDigest,
        ),
      this.database
        .prepare(
          `INSERT INTO learning_record_deletion_replays (
             id, deletion_receipt_id, restore_id, scope_digest,
             pre_replay_revision, pre_replay_event_count,
             pre_replay_event_digest, deleted_event_count, replayed_at,
             receipt_digest
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (deletion_receipt_id, restore_id) DO NOTHING`,
        )
        .bind(
          replay.id,
          replay.deletionReceiptId,
          replay.restoreId,
          replay.scopeDigest,
          replay.preReplayRevision,
          replay.preReplayEventCount,
          replay.preReplayEventDigest,
          replay.deletedEventCount,
          replay.replayedAt,
          replay.receiptDigest,
        ),
      this.database
        .prepare(
          `DELETE FROM learning_events
            WHERE installation_id = ? AND user_id = ?
              AND EXISTS (
                SELECT 1 FROM learning_record_deletion_replays
                 WHERE id = ?
              )`,
        )
        .bind(installationId, learnerId, replay.id),
      this.database
        .prepare(
          `DELETE FROM learning_event_streams
            WHERE installation_id = ? AND user_id = ?
              AND EXISTS (
                SELECT 1 FROM learning_record_deletion_replays
                 WHERE id = ?
              )`,
        )
        .bind(installationId, learnerId, replay.id),
    ]);
    const stored = await this.findDeletionReplay(
      deletionReceipt.id,
      restoreId,
    );
    if (!stored) {
      throw new LearningEventEngineError(
        "concurrency-conflict",
        "Deletion replay did not commit.",
      );
    }
    if (stored.receiptDigest !== replay.receiptDigest) {
      throw new LearningEventEngineError(
        "idempotency-conflict",
        "The restore ID is already bound to different replay evidence.",
      );
    }
    return stored;
  }

  async findByIdempotencyKey(
    installationId: string,
    learnerId: string,
    idempotencyKey: string,
  ): Promise<{ event: LearningEvent; appendToken: string } | null> {
    const row = await this.database
      .prepare(
        `SELECT sequence, id, installation_id, user_id, idempotency_key,
                event_type, content_version, command_digest, occurred_at,
                recorded_at, actor_type, actor_user_id, payload_json,
                append_token
           FROM learning_events
          WHERE installation_id = ? AND user_id = ? AND idempotency_key = ?`,
      )
      .bind(installationId, learnerId, idempotencyKey)
      .first<LearningEventRow>();
    return row
      ? { event: mapEventRow(row), appendToken: row.append_token }
      : null;
  }

  async throwDuplicateEvidence(
    candidate: LearningEventCandidate,
    cause?: unknown,
  ): Promise<void> {
    if (candidate.type === "assessment.recorded") {
      const duplicate = await this.database
        .prepare(
          `SELECT id FROM learning_events
            WHERE installation_id = ? AND user_id = ?
              AND assessment_attempt_id = ?`,
        )
        .bind(
          candidate.installationId,
          candidate.learnerId,
          candidate.payload.attemptId,
        )
        .first<{ id: string }>();
      if (duplicate) {
        throw new LearningEventEngineError(
          "duplicate-attempt-id",
          "Assessment attempt IDs are immutable and unique per learner.",
        );
      }
    }
    if (candidate.type === "assessment.corrected") {
      const duplicate = await this.database
        .prepare(
          `SELECT id FROM learning_events
            WHERE installation_id = ? AND user_id = ?
              AND assessment_correction_id = ?`,
        )
        .bind(
          candidate.installationId,
          candidate.learnerId,
          candidate.payload.correctionId,
        )
        .first<{ id: string }>();
      if (duplicate) {
        throw new LearningEventEngineError(
          "duplicate-correction-id",
          "Assessment correction IDs are immutable and unique per learner.",
        );
      }
    }
    if (cause instanceof Error) throw cause;
  }

  async findDeletionReceiptByOperation(
    scopeDigest: string,
    operationKey: string,
  ): Promise<LearningRecordDeletionReceipt | null> {
    const row = await this.database
      .prepare(
        `SELECT id, operation_key, scope_digest, source_revision, event_count,
                event_digest, deleted_at, receipt_digest
           FROM learning_record_deletion_receipts
          WHERE scope_digest = ? AND operation_key = ?`,
      )
      .bind(scopeDigest, operationKey)
      .first<LearningRecordDeletionReceiptRow>();
    return row ? mapDeletionReceiptRow(row) : null;
  }

  async findDeletionReplay(
    deletionReceiptId: string,
    restoreId: string,
  ): Promise<LearningRecordDeletionReplay | null> {
    const row = await this.database
      .prepare(
        `SELECT id, deletion_receipt_id, restore_id, scope_digest,
                pre_replay_revision, pre_replay_event_count,
                pre_replay_event_digest, deleted_event_count, replayed_at,
                receipt_digest
           FROM learning_record_deletion_replays
          WHERE deletion_receipt_id = ? AND restore_id = ?`,
      )
      .bind(deletionReceiptId, restoreId)
      .first<LearningRecordDeletionReplayRow>();
    return row ? mapDeletionReplayRow(row) : null;
  }
}

function compareIdempotent(
  stored: { event: LearningEvent },
  candidate: LearningEventCandidate,
): LearningEventAppendResult {
  if (stored.event.commandDigest !== candidate.commandDigest) {
    throw new LearningEventEngineError(
      "idempotency-conflict",
      "The idempotency key is already bound to another learning command.",
    );
  }
  return { event: stored.event, replayed: true };
}

function mapEventRow(row: LearningEventRow): LearningEvent {
  const event = {
    schemaVersion: "1.0",
    id: row.id,
    sequence: Number(row.sequence),
    type: row.event_type,
    installationId: row.installation_id,
    learnerId: row.user_id,
    idempotencyKey: row.idempotency_key,
    contentVersion: row.content_version,
    commandDigest: row.command_digest,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    actor: {
      type: row.actor_type,
      userId: row.actor_user_id,
    },
    payload: JSON.parse(row.payload_json),
  } as LearningEvent;
  const validation = validateLearningEvent(event);
  if (!validation.valid) {
    throw new LearningEventEngineError(
      "invalid-event",
      `Stored learning event is invalid: ${validation.errors.join("; ")}`,
    );
  }
  return event;
}

function mapDeletionReceiptRow(
  row: LearningRecordDeletionReceiptRow,
): LearningRecordDeletionReceipt {
  return {
    schemaVersion: "1.0",
    receiptType: "learning-record.deleted",
    id: row.id,
    operationKey: row.operation_key,
    scopeDigest: row.scope_digest,
    sourceRevision: Number(row.source_revision),
    eventCount: Number(row.event_count),
    eventDigest: row.event_digest,
    deletedAt: row.deleted_at,
    receiptDigest: row.receipt_digest,
  };
}

function mapDeletionReplayRow(
  row: LearningRecordDeletionReplayRow,
): LearningRecordDeletionReplay {
  return {
    schemaVersion: "1.0",
    receiptType: "learning-record.deletion-replayed",
    id: row.id,
    deletionReceiptId: row.deletion_receipt_id,
    restoreId: row.restore_id,
    scopeDigest: row.scope_digest,
    preReplayRevision: Number(row.pre_replay_revision),
    preReplayEventCount: Number(row.pre_replay_event_count),
    preReplayEventDigest: row.pre_replay_event_digest,
    deletedEventCount: Number(row.deleted_event_count),
    replayedAt: row.replayed_at,
    receiptDigest: row.receipt_digest,
  };
}

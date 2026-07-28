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

export class SqlLearningEventStore implements LearningEventStore {
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

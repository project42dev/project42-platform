PRAGMA foreign_keys = ON;

CREATE TABLE learning_events_v1_1 (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  installation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0' CHECK (
    schema_version IN ('1.0', '1.1')
  ),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'path.enrolled',
      'module.visited',
      'assessment.recorded',
      'module.completed',
      'assessment.corrected',
      'progress.imported'
    )
  ),
  content_version TEXT NOT NULL,
  command_digest TEXT NOT NULL CHECK (
    length(command_digest) = 64 AND
    command_digest NOT GLOB '*[^a-f0-9]*'
  ),
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('learner', 'owner', 'system')),
  actor_user_id TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  assessment_attempt_id TEXT,
  assessment_correction_id TEXT,
  append_token TEXT NOT NULL UNIQUE,
  FOREIGN KEY (installation_id, user_id)
    REFERENCES learning_event_streams(installation_id, user_id)
    ON DELETE CASCADE,
  UNIQUE (installation_id, user_id, idempotency_key)
) STRICT;

INSERT INTO learning_events_v1_1 (
  sequence, id, installation_id, user_id, idempotency_key, schema_version,
  event_type, content_version, command_digest, occurred_at, recorded_at,
  actor_type, actor_user_id, payload_json, assessment_attempt_id,
  assessment_correction_id, append_token
)
SELECT
  sequence, id, installation_id, user_id, idempotency_key, '1.0',
  event_type, content_version, command_digest, occurred_at, recorded_at,
  actor_type, actor_user_id, payload_json, assessment_attempt_id,
  assessment_correction_id, append_token
FROM learning_events;

DROP TABLE learning_events;
ALTER TABLE learning_events_v1_1 RENAME TO learning_events;

CREATE UNIQUE INDEX learning_events_attempt_id
  ON learning_events (installation_id, user_id, assessment_attempt_id)
  WHERE assessment_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX learning_events_correction_id
  ON learning_events (installation_id, user_id, assessment_correction_id)
  WHERE assessment_correction_id IS NOT NULL;

CREATE INDEX learning_events_by_learner_sequence
  ON learning_events (installation_id, user_id, sequence);

CREATE TRIGGER learning_events_are_immutable
BEFORE UPDATE ON learning_events
BEGIN
  SELECT RAISE(ABORT, 'learning events are immutable');
END;

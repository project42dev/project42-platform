PRAGMA foreign_keys = ON;

CREATE TABLE learning_event_streams (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  write_token TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id)
) STRICT;

CREATE TABLE learning_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  installation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'path.enrolled',
      'module.visited',
      'assessment.recorded',
      'module.completed',
      'assessment.corrected'
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

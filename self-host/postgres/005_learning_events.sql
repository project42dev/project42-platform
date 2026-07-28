BEGIN;

CREATE TABLE learning_event_streams (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  write_token text,
  updated_at text NOT NULL,
  PRIMARY KEY (installation_id, user_id)
);

CREATE TABLE learning_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id text NOT NULL UNIQUE,
  installation_id text NOT NULL,
  user_id text NOT NULL,
  idempotency_key text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'path.enrolled',
      'module.visited',
      'assessment.recorded',
      'module.completed',
      'assessment.corrected'
    )
  ),
  content_version text NOT NULL,
  command_digest text NOT NULL CHECK (
    command_digest ~ '^[a-f0-9]{64}$'
  ),
  occurred_at text NOT NULL,
  recorded_at text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('learner', 'owner', 'system')),
  actor_user_id text,
  payload_json text NOT NULL CHECK (payload_json::jsonb IS NOT NULL),
  assessment_attempt_id text,
  assessment_correction_id text,
  append_token text NOT NULL UNIQUE,
  FOREIGN KEY (installation_id, user_id)
    REFERENCES learning_event_streams(installation_id, user_id)
    ON DELETE CASCADE,
  UNIQUE (installation_id, user_id, idempotency_key)
);

CREATE UNIQUE INDEX learning_events_attempt_id
  ON learning_events (installation_id, user_id, assessment_attempt_id)
  WHERE assessment_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX learning_events_correction_id
  ON learning_events (installation_id, user_id, assessment_correction_id)
  WHERE assessment_correction_id IS NOT NULL;

CREATE INDEX learning_events_by_learner_sequence
  ON learning_events (installation_id, user_id, sequence);

CREATE FUNCTION block_learning_event_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'learning events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learning_events_are_immutable
BEFORE UPDATE ON learning_events
FOR EACH ROW EXECUTE FUNCTION block_learning_event_update();

COMMIT;

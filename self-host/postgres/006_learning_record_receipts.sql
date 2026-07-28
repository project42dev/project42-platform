BEGIN;

CREATE TABLE learning_record_deletion_receipts (
  id text PRIMARY KEY,
  operation_key text NOT NULL,
  scope_digest text NOT NULL CHECK (scope_digest ~ '^[a-f0-9]{64}$'),
  source_revision integer NOT NULL CHECK (source_revision >= 0),
  event_count integer NOT NULL CHECK (event_count >= 0),
  event_digest text NOT NULL CHECK (event_digest ~ '^[a-f0-9]{64}$'),
  deleted_at text NOT NULL,
  receipt_digest text NOT NULL UNIQUE CHECK (
    receipt_digest ~ '^[a-f0-9]{64}$'
  ),
  UNIQUE (scope_digest, operation_key),
  CHECK (source_revision = event_count)
);

CREATE TABLE learning_record_deletion_replays (
  id text PRIMARY KEY,
  deletion_receipt_id text NOT NULL
    REFERENCES learning_record_deletion_receipts(id) ON DELETE RESTRICT,
  restore_id text NOT NULL,
  scope_digest text NOT NULL CHECK (scope_digest ~ '^[a-f0-9]{64}$'),
  pre_replay_revision integer NOT NULL CHECK (pre_replay_revision >= 0),
  pre_replay_event_count integer NOT NULL CHECK (pre_replay_event_count >= 0),
  pre_replay_event_digest text NOT NULL CHECK (
    pre_replay_event_digest ~ '^[a-f0-9]{64}$'
  ),
  deleted_event_count integer NOT NULL CHECK (deleted_event_count >= 0),
  replayed_at text NOT NULL,
  receipt_digest text NOT NULL UNIQUE CHECK (
    receipt_digest ~ '^[a-f0-9]{64}$'
  ),
  UNIQUE (deletion_receipt_id, restore_id),
  CHECK (pre_replay_revision = pre_replay_event_count),
  CHECK (deleted_event_count = pre_replay_event_count)
);

CREATE FUNCTION block_learning_record_receipt_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'learning record receipts are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learning_record_deletion_receipts_are_immutable
BEFORE UPDATE ON learning_record_deletion_receipts
FOR EACH ROW EXECUTE FUNCTION block_learning_record_receipt_update();

CREATE TRIGGER learning_record_deletion_replays_are_immutable
BEFORE UPDATE ON learning_record_deletion_replays
FOR EACH ROW EXECUTE FUNCTION block_learning_record_receipt_update();

COMMIT;

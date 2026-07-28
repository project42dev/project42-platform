PRAGMA foreign_keys = ON;

CREATE TABLE learning_record_deletion_receipts (
  id TEXT PRIMARY KEY,
  operation_key TEXT NOT NULL,
  scope_digest TEXT NOT NULL CHECK (
    length(scope_digest) = 64 AND
    scope_digest NOT GLOB '*[^a-f0-9]*'
  ),
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  event_count INTEGER NOT NULL CHECK (event_count >= 0),
  event_digest TEXT NOT NULL CHECK (
    length(event_digest) = 64 AND
    event_digest NOT GLOB '*[^a-f0-9]*'
  ),
  deleted_at TEXT NOT NULL,
  receipt_digest TEXT NOT NULL UNIQUE CHECK (
    length(receipt_digest) = 64 AND
    receipt_digest NOT GLOB '*[^a-f0-9]*'
  ),
  UNIQUE (scope_digest, operation_key),
  CHECK (source_revision = event_count)
) STRICT;

CREATE TABLE learning_record_deletion_replays (
  id TEXT PRIMARY KEY,
  deletion_receipt_id TEXT NOT NULL
    REFERENCES learning_record_deletion_receipts(id) ON DELETE RESTRICT,
  restore_id TEXT NOT NULL,
  scope_digest TEXT NOT NULL CHECK (
    length(scope_digest) = 64 AND
    scope_digest NOT GLOB '*[^a-f0-9]*'
  ),
  pre_replay_revision INTEGER NOT NULL CHECK (pre_replay_revision >= 0),
  pre_replay_event_count INTEGER NOT NULL CHECK (pre_replay_event_count >= 0),
  pre_replay_event_digest TEXT NOT NULL CHECK (
    length(pre_replay_event_digest) = 64 AND
    pre_replay_event_digest NOT GLOB '*[^a-f0-9]*'
  ),
  deleted_event_count INTEGER NOT NULL CHECK (deleted_event_count >= 0),
  replayed_at TEXT NOT NULL,
  receipt_digest TEXT NOT NULL UNIQUE CHECK (
    length(receipt_digest) = 64 AND
    receipt_digest NOT GLOB '*[^a-f0-9]*'
  ),
  UNIQUE (deletion_receipt_id, restore_id),
  CHECK (pre_replay_revision = pre_replay_event_count),
  CHECK (deleted_event_count = pre_replay_event_count)
) STRICT;

CREATE TRIGGER learning_record_deletion_receipts_are_immutable
BEFORE UPDATE ON learning_record_deletion_receipts
BEGIN
  SELECT RAISE(ABORT, 'learning record deletion receipts are immutable');
END;

CREATE TRIGGER learning_record_deletion_replays_are_immutable
BEFORE UPDATE ON learning_record_deletion_replays
BEGIN
  SELECT RAISE(ABORT, 'learning record deletion replays are immutable');
END;

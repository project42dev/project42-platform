PRAGMA foreign_keys = ON;

CREATE TABLE account_merge_proofs (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  proof_method TEXT NOT NULL CHECK (
    proof_method IN ('recent-authentication', 'owner-assisted-recovery')
  ),
  token_digest TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(evidence_json)),
  status TEXT NOT NULL CHECK (
    status IN ('available', 'consumed', 'expired', 'cancelled')
  ),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  request_id TEXT NOT NULL,
  UNIQUE (installation_id, token_digest)
) STRICT;

CREATE INDEX account_merge_proofs_by_user
  ON account_merge_proofs (
    installation_id, user_id, status, expires_at
  );

CREATE TABLE account_merge_cases (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  source_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  survivor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_proof_id TEXT REFERENCES account_merge_proofs(id) ON DELETE SET NULL,
  survivor_proof_id TEXT REFERENCES account_merge_proofs(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (
    status IN ('preview', 'completed', 'rolled-back', 'cancelled', 'failed')
  ),
  preview_json TEXT NOT NULL CHECK (json_valid(preview_json)),
  preview_digest TEXT NOT NULL,
  resolutions_json TEXT CHECK (
    resolutions_json IS NULL OR json_valid(resolutions_json)
  ),
  snapshot_digest TEXT,
  idempotency_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  rolled_back_at TEXT,
  CHECK (source_user_id <> survivor_user_id),
  UNIQUE (installation_id, idempotency_key)
) STRICT;

CREATE INDEX account_merge_cases_by_accounts
  ON account_merge_cases (
    installation_id, survivor_user_id, source_user_id, status, created_at
  );

CREATE UNIQUE INDEX one_live_merge_case_per_source
  ON account_merge_cases (installation_id, source_user_id)
  WHERE status IN ('preview', 'completed');

CREATE TABLE account_merge_snapshot_rows (
  merge_case_id TEXT NOT NULL REFERENCES account_merge_cases(id) ON DELETE RESTRICT,
  table_name TEXT NOT NULL,
  row_key TEXT NOT NULL,
  row_json TEXT NOT NULL CHECK (json_valid(row_json)),
  row_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (merge_case_id, table_name, row_key)
) STRICT;

CREATE TABLE account_merge_aliases (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  source_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  survivor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merge_case_id TEXT NOT NULL UNIQUE
    REFERENCES account_merge_cases(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, source_user_id),
  CHECK (source_user_id <> survivor_user_id)
) STRICT;

CREATE INDEX account_merge_aliases_by_survivor
  ON account_merge_aliases (installation_id, survivor_user_id, created_at);

CREATE TABLE account_merge_receipts (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  merge_case_id TEXT NOT NULL UNIQUE
    REFERENCES account_merge_cases(id) ON DELETE RESTRICT,
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  receipt_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE account_merge_recovery_receipts (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  merge_case_id TEXT NOT NULL UNIQUE
    REFERENCES account_merge_cases(id) ON DELETE RESTRICT,
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  receipt_digest TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER account_merge_receipts_are_immutable_on_update
BEFORE UPDATE ON account_merge_receipts
BEGIN
  SELECT RAISE(ABORT, 'account merge receipts are immutable');
END;

CREATE TRIGGER account_merge_receipts_are_immutable_on_delete
BEFORE DELETE ON account_merge_receipts
BEGIN
  SELECT RAISE(ABORT, 'account merge receipts are immutable');
END;

CREATE TRIGGER account_merge_recovery_receipts_are_immutable_on_update
BEFORE UPDATE ON account_merge_recovery_receipts
BEGIN
  SELECT RAISE(ABORT, 'account merge recovery receipts are immutable');
END;

CREATE TRIGGER account_merge_recovery_receipts_are_immutable_on_delete
BEFORE DELETE ON account_merge_recovery_receipts
BEGIN
  SELECT RAISE(ABORT, 'account merge recovery receipts are immutable');
END;

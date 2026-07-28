BEGIN;

CREATE TABLE account_merge_proofs (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  proof_method text NOT NULL CHECK (
    proof_method IN ('recent-authentication', 'owner-assisted-recovery')
  ),
  token_digest text NOT NULL,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (
    status IN ('available', 'consumed', 'expired', 'cancelled')
  ),
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  request_id text NOT NULL,
  UNIQUE (installation_id, token_digest)
);

CREATE INDEX account_merge_proofs_by_user
  ON account_merge_proofs (
    installation_id, user_id, status, expires_at
  );

CREATE TABLE account_merge_cases (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  source_user_id text REFERENCES users(id) ON DELETE SET NULL,
  survivor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  source_proof_id text REFERENCES account_merge_proofs(id) ON DELETE SET NULL,
  survivor_proof_id text REFERENCES account_merge_proofs(id) ON DELETE SET NULL,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (
    status IN ('preview', 'completed', 'rolled-back', 'cancelled', 'failed')
  ),
  preview_json jsonb NOT NULL,
  preview_digest text NOT NULL,
  resolutions_json jsonb,
  snapshot_digest text,
  idempotency_key text NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  CHECK (source_user_id <> survivor_user_id),
  UNIQUE (installation_id, idempotency_key)
);

CREATE INDEX account_merge_cases_by_accounts
  ON account_merge_cases (
    installation_id, survivor_user_id, source_user_id, status, created_at
  );

CREATE UNIQUE INDEX one_live_merge_case_per_source
  ON account_merge_cases (installation_id, source_user_id)
  WHERE status IN ('preview', 'completed');

CREATE TABLE account_merge_snapshot_rows (
  merge_case_id text NOT NULL REFERENCES account_merge_cases(id) ON DELETE RESTRICT,
  table_name text NOT NULL,
  row_key text NOT NULL,
  row_json jsonb NOT NULL,
  row_digest text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (merge_case_id, table_name, row_key)
);

CREATE TABLE account_merge_aliases (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  source_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  survivor_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merge_case_id text NOT NULL UNIQUE
    REFERENCES account_merge_cases(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (installation_id, source_user_id),
  CHECK (source_user_id <> survivor_user_id)
);

CREATE INDEX account_merge_aliases_by_survivor
  ON account_merge_aliases (installation_id, survivor_user_id, created_at);

CREATE TABLE account_merge_receipts (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  merge_case_id text NOT NULL UNIQUE
    REFERENCES account_merge_cases(id) ON DELETE RESTRICT,
  receipt_json jsonb NOT NULL,
  receipt_digest text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE account_merge_recovery_receipts (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  merge_case_id text NOT NULL UNIQUE
    REFERENCES account_merge_cases(id) ON DELETE RESTRICT,
  receipt_json jsonb NOT NULL,
  receipt_digest text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION reject_account_merge_immutable_change()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'account merge evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER account_merge_receipts_are_immutable_on_update
BEFORE UPDATE ON account_merge_receipts
FOR EACH ROW EXECUTE FUNCTION reject_account_merge_immutable_change();

CREATE TRIGGER account_merge_receipts_are_immutable_on_delete
BEFORE DELETE ON account_merge_receipts
FOR EACH ROW EXECUTE FUNCTION reject_account_merge_immutable_change();

CREATE TRIGGER account_merge_recovery_receipts_are_immutable_on_update
BEFORE UPDATE ON account_merge_recovery_receipts
FOR EACH ROW EXECUTE FUNCTION reject_account_merge_immutable_change();

CREATE TRIGGER account_merge_recovery_receipts_are_immutable_on_delete
BEFORE DELETE ON account_merge_recovery_receipts
FOR EACH ROW EXECUTE FUNCTION reject_account_merge_immutable_change();

COMMIT;

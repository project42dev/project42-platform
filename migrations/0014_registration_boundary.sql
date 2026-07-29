ALTER TABLE users
  ADD COLUMN state_revision INTEGER NOT NULL DEFAULT 1
  CHECK (state_revision > 0);

ALTER TABLE users
  ADD COLUMN state_transition_id TEXT;

ALTER TABLE approval_decisions
  ADD COLUMN transition_id TEXT;

CREATE UNIQUE INDEX approval_decisions_by_transition
  ON approval_decisions (installation_id, transition_id)
  WHERE transition_id IS NOT NULL;

CREATE TRIGGER require_atomic_owner_account_transition
BEFORE INSERT ON approval_decisions
WHEN NEW.decision_kind = 'owner-decision'
  AND NEW.from_state IS NOT NULL
  AND (
    NEW.transition_id IS NULL OR
    NOT EXISTS (
      SELECT 1
        FROM users
       WHERE id = NEW.user_id
         AND installation_id = NEW.installation_id
         AND account_state = NEW.to_state
         AND state_transition_id = NEW.transition_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'stale owner account state transition');
END;

CREATE TABLE registration_requests (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  receipt_token_digest TEXT NOT NULL CHECK (length(receipt_token_digest) = 64),
  requested_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  replaced_by_request_id TEXT,
  CHECK (last_seen_at >= requested_at),
  CHECK (expires_at > requested_at),
  CHECK (revoked_at IS NULL OR revoked_at >= requested_at),
  CHECK (replaced_by_request_id IS NULL OR revoked_at IS NOT NULL),
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by_request_id) REFERENCES registration_requests(id),
  UNIQUE (installation_id, receipt_token_digest)
) STRICT;

CREATE INDEX registration_requests_by_user
  ON registration_requests (
    installation_id,
    user_id,
    revoked_at,
    expires_at
  );

CREATE TRIGGER block_registration_receipt_rebinding
BEFORE UPDATE OF installation_id, user_id, receipt_token_digest
ON registration_requests
WHEN
  OLD.installation_id <> NEW.installation_id OR
  OLD.user_id <> NEW.user_id OR
  OLD.receipt_token_digest <> NEW.receipt_token_digest
BEGIN
  SELECT RAISE(ABORT, 'registration receipt identity is immutable');
END;

CREATE TRIGGER enforce_registration_request_installation
BEFORE INSERT ON registration_requests
WHEN NOT EXISTS (
  SELECT 1
    FROM users
   WHERE id = NEW.user_id
     AND installation_id = NEW.installation_id
)
BEGIN
  SELECT RAISE(ABORT, 'registration request user belongs to another installation');
END;

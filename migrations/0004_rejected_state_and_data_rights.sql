PRAGMA defer_foreign_keys = true;

CREATE TABLE users_v2 (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  display_name TEXT,
  primary_email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  account_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (account_state IN ('pending', 'approved', 'rejected', 'suspended', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO users_v2 (
  id,
  installation_id,
  display_name,
  primary_email,
  email_verified,
  account_state,
  created_at,
  updated_at
)
SELECT
  id,
  installation_id,
  display_name,
  primary_email,
  email_verified,
  account_state,
  created_at,
  updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_v2 RENAME TO users;

CREATE INDEX users_by_installation_state
  ON users (installation_id, account_state, created_at);

CREATE TRIGGER revoked_accounts_are_terminal
BEFORE UPDATE OF account_state ON users
WHEN OLD.account_state = 'revoked' AND NEW.account_state <> 'revoked'
BEGIN
  SELECT RAISE(ABORT, 'revoked accounts are terminal');
END;

CREATE TRIGGER block_invalid_account_state_transitions
BEFORE UPDATE OF account_state ON users
WHEN NOT (
  (OLD.account_state = 'pending' AND NEW.account_state IN ('approved', 'rejected', 'revoked')) OR
  (OLD.account_state = 'approved' AND NEW.account_state IN ('suspended', 'revoked')) OR
  (OLD.account_state = 'rejected' AND NEW.account_state IN ('approved', 'revoked')) OR
  (OLD.account_state = 'suspended' AND NEW.account_state IN ('approved', 'revoked')) OR
  OLD.account_state = NEW.account_state
)
BEGIN
  SELECT RAISE(ABORT, 'invalid account state transition');
END;

DROP TRIGGER audit_events_are_immutable_on_update;

CREATE TRIGGER audit_events_are_immutable_on_update
BEFORE UPDATE ON audit_events
WHEN NOT (
  NEW.sequence = OLD.sequence AND
  NEW.id = OLD.id AND
  NEW.installation_id = OLD.installation_id AND
  (NEW.actor_user_id IS OLD.actor_user_id OR NEW.actor_user_id IS NULL) AND
  (NEW.actor_issuer IS OLD.actor_issuer OR NEW.actor_issuer IS NULL) AND
  (NEW.actor_subject IS OLD.actor_subject OR NEW.actor_subject IS NULL) AND
  NEW.action = OLD.action AND
  NEW.target_type = OLD.target_type AND
  (NEW.target_id IS OLD.target_id OR NEW.target_id IS NULL) AND
  NEW.request_id = OLD.request_id AND
  NEW.outcome = OLD.outcome AND
  NEW.reason IS OLD.reason AND
  NEW.metadata_json = OLD.metadata_json AND
  NEW.occurred_at = OLD.occurred_at
)
BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable except for privacy redaction');
END;

CREATE TABLE approved_email_domains_v2 (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  UNIQUE (installation_id, domain)
) STRICT;

INSERT INTO approved_email_domains_v2 (
  id,
  installation_id,
  domain,
  enabled,
  created_by_user_id,
  created_at,
  updated_at,
  policy_version
)
SELECT
  id,
  installation_id,
  domain,
  enabled,
  created_by_user_id,
  created_at,
  updated_at,
  policy_version
FROM approved_email_domains;

CREATE TABLE approval_decisions_v2 (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_state TEXT CHECK (
    from_state IS NULL OR
    from_state IN ('pending', 'approved', 'rejected', 'suspended', 'revoked')
  ),
  to_state TEXT NOT NULL
    CHECK (to_state IN ('pending', 'approved', 'rejected', 'suspended', 'revoked')),
  decision_kind TEXT NOT NULL CHECK (
    decision_kind IN ('registration', 'domain-auto-approval', 'owner-decision')
  ),
  reason TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  domain_rule_id TEXT REFERENCES approved_email_domains_v2(id) ON DELETE SET NULL,
  decided_at TEXT NOT NULL
) STRICT;

INSERT INTO approval_decisions_v2 (
  id,
  installation_id,
  user_id,
  from_state,
  to_state,
  decision_kind,
  reason,
  actor_user_id,
  domain_rule_id,
  decided_at
)
SELECT
  id,
  installation_id,
  user_id,
  from_state,
  to_state,
  decision_kind,
  reason,
  actor_user_id,
  domain_rule_id,
  decided_at
FROM approval_decisions;

DROP TABLE approval_decisions;
DROP TABLE approved_email_domains;
ALTER TABLE approved_email_domains_v2 RENAME TO approved_email_domains;
ALTER TABLE approval_decisions_v2 RENAME TO approval_decisions;

CREATE INDEX approvals_by_user
  ON approval_decisions (installation_id, user_id, decided_at);

CREATE UNIQUE INDEX one_active_deletion_request_per_user
  ON deletion_requests (installation_id, user_id)
  WHERE state IN ('requested', 'processing');

CREATE TABLE deletion_tombstones (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  subject_digest TEXT NOT NULL,
  deletion_request_id TEXT NOT NULL UNIQUE,
  requested_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  completed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX deletion_tombstones_by_installation_time
  ON deletion_tombstones (installation_id, completed_at);

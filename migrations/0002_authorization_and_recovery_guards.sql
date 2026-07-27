CREATE INDEX users_by_installation_state
  ON users (installation_id, account_state, created_at);
CREATE INDEX identities_by_user
  ON user_identities (installation_id, user_id);
CREATE INDEX approvals_by_user
  ON approval_decisions (installation_id, user_id, decided_at);
CREATE INDEX attempts_by_user_completed
  ON assessment_attempts (installation_id, user_id, completed_at);
CREATE INDEX module_progress_by_user
  ON module_progress (installation_id, user_id, updated_at);
CREATE INDEX audits_by_installation_time
  ON audit_events (installation_id, occurred_at);
CREATE INDEX audits_by_actor_time
  ON audit_events (installation_id, actor_user_id, occurred_at);

CREATE TRIGGER audit_events_are_immutable_on_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable');
END;

CREATE TRIGGER audit_events_are_immutable_on_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable');
END;

CREATE TRIGGER revoked_accounts_are_terminal
BEFORE UPDATE OF account_state ON users
WHEN OLD.account_state = 'revoked' AND NEW.account_state <> 'revoked'
BEGIN
  SELECT RAISE(ABORT, 'revoked accounts are terminal');
END;

CREATE TRIGGER block_invalid_account_state_transitions
BEFORE UPDATE OF account_state ON users
WHEN NOT (
  (OLD.account_state = 'pending' AND NEW.account_state IN ('approved', 'revoked')) OR
  (OLD.account_state = 'approved' AND NEW.account_state IN ('suspended', 'revoked')) OR
  (OLD.account_state = 'suspended' AND NEW.account_state IN ('approved', 'revoked')) OR
  OLD.account_state = NEW.account_state
)
BEGIN
  SELECT RAISE(ABORT, 'invalid account state transition');
END;

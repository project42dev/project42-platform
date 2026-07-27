BEGIN;

CREATE TABLE installations (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE users (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  display_name text,
  primary_email text,
  email_verified integer NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  account_state text NOT NULL DEFAULT 'pending'
    CHECK (account_state IN ('pending', 'approved', 'rejected', 'suspended', 'revoked')),
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE user_identities (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at text NOT NULL,
  PRIMARY KEY (installation_id, issuer, subject),
  UNIQUE (installation_id, user_id)
);

CREATE TABLE role_assignments (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('learner', 'owner')),
  assigned_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  assigned_at text NOT NULL,
  PRIMARY KEY (installation_id, user_id, role)
);

CREATE TABLE approved_email_domains (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  enabled integer NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  policy_version integer NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  UNIQUE (installation_id, domain)
);

CREATE TABLE approval_decisions (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_state text CHECK (
    from_state IS NULL OR
    from_state IN ('pending', 'approved', 'rejected', 'suspended', 'revoked')
  ),
  to_state text NOT NULL
    CHECK (to_state IN ('pending', 'approved', 'rejected', 'suspended', 'revoked')),
  decision_kind text NOT NULL
    CHECK (decision_kind IN ('registration', 'domain-auto-approval', 'owner-decision')),
  reason text NOT NULL,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  domain_rule_id text REFERENCES approved_email_domains(id) ON DELETE SET NULL,
  decided_at text NOT NULL
);

CREATE TABLE learning_progress (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version integer NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  progress_json text NOT NULL CHECK (progress_json::jsonb IS NOT NULL),
  updated_at text NOT NULL,
  PRIMARY KEY (installation_id, user_id)
);

CREATE TABLE module_progress (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path_id text NOT NULL,
  module_id text NOT NULL,
  content_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('visited', 'completed')),
  first_seen_at text NOT NULL,
  completed_at text,
  updated_at text NOT NULL,
  PRIMARY KEY (installation_id, user_id, path_id, module_id, content_version)
);

CREATE TABLE assessment_attempts (
  id text NOT NULL,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path_id text NOT NULL,
  module_id text NOT NULL,
  content_version text NOT NULL,
  score_percent double precision NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
  passed integer NOT NULL CHECK (passed IN (0, 1)),
  completed_at text NOT NULL,
  recorded_at text NOT NULL,
  PRIMARY KEY (installation_id, user_id, id)
);

CREATE TABLE transcript_entries (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path_id text NOT NULL,
  path_title text NOT NULL,
  completed_modules integer NOT NULL CHECK (completed_modules >= 0),
  total_modules integer NOT NULL CHECK (total_modules >= 0),
  completion_percent double precision NOT NULL CHECK (completion_percent BETWEEN 0 AND 100),
  best_score_percent double precision CHECK (best_score_percent BETWEEN 0 AND 100),
  content_version text NOT NULL,
  updated_at text NOT NULL,
  PRIMARY KEY (installation_id, user_id, path_id, content_version)
);

CREATE TABLE badge_definitions (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  definition_version text NOT NULL,
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE user_badges (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  earned_at text NOT NULL,
  evidence_module_ids_json text NOT NULL CHECK (evidence_module_ids_json::jsonb IS NOT NULL),
  recorded_at text NOT NULL,
  PRIMARY KEY (installation_id, user_id, badge_id)
);

CREATE TABLE progress_imports (
  id text NOT NULL,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('browser-local-v1', 'project42-portable-json')),
  source_checksum text NOT NULL,
  imported_revision integer NOT NULL CHECK (imported_revision > 0),
  imported_at text NOT NULL,
  PRIMARY KEY (installation_id, user_id, id)
);

CREATE TABLE audit_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id text NOT NULL UNIQUE,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  actor_issuer text,
  actor_subject text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  request_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
  reason text,
  metadata_json text NOT NULL DEFAULT '{}' CHECK (metadata_json::jsonb IS NOT NULL),
  occurred_at text NOT NULL
);

CREATE TABLE consent_records (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  policy_version text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('granted', 'withdrawn')),
  decided_at text NOT NULL
);

CREATE TABLE deletion_requests (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('requested', 'cancelled', 'processing', 'completed')),
  requested_at text NOT NULL,
  cancellation_deadline text NOT NULL,
  completed_at text
);

CREATE UNIQUE INDEX one_active_deletion_request_per_user
  ON deletion_requests (installation_id, user_id)
  WHERE state IN ('requested', 'processing');

CREATE TABLE deletion_tombstones (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  subject_digest text NOT NULL,
  deletion_request_id text NOT NULL UNIQUE,
  requested_at text NOT NULL,
  completed_at text NOT NULL,
  completed_by_user_id text REFERENCES users(id) ON DELETE SET NULL
);

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
CREATE INDEX approved_domains_by_installation_state
  ON approved_email_domains (installation_id, enabled, domain, policy_version);
CREATE INDEX deletion_tombstones_by_installation_time
  ON deletion_tombstones (installation_id, completed_at);

CREATE FUNCTION enforce_audit_event_update() RETURNS trigger AS $$
BEGIN
  IF NOT (
    NEW.sequence = OLD.sequence AND
    NEW.id = OLD.id AND
    NEW.installation_id = OLD.installation_id AND
    (NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id OR NEW.actor_user_id IS NULL) AND
    (NEW.actor_issuer IS NOT DISTINCT FROM OLD.actor_issuer OR NEW.actor_issuer IS NULL) AND
    (NEW.actor_subject IS NOT DISTINCT FROM OLD.actor_subject OR NEW.actor_subject IS NULL) AND
    NEW.action = OLD.action AND
    NEW.target_type = OLD.target_type AND
    (NEW.target_id IS NOT DISTINCT FROM OLD.target_id OR NEW.target_id IS NULL) AND
    NEW.request_id = OLD.request_id AND
    NEW.outcome = OLD.outcome AND
    NEW.reason IS NOT DISTINCT FROM OLD.reason AND
    NEW.metadata_json = OLD.metadata_json AND
    NEW.occurred_at = OLD.occurred_at
  ) THEN
    RAISE EXCEPTION 'audit events are immutable except for privacy redaction';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_are_immutable_on_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION enforce_audit_event_update();

CREATE FUNCTION block_audit_event_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_are_immutable_on_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION block_audit_event_delete();

CREATE FUNCTION enforce_account_state_transition() RETURNS trigger AS $$
BEGIN
  IF NOT (
    (OLD.account_state = 'pending' AND NEW.account_state IN ('approved', 'rejected', 'revoked')) OR
    (OLD.account_state = 'approved' AND NEW.account_state IN ('suspended', 'revoked')) OR
    (OLD.account_state = 'rejected' AND NEW.account_state IN ('approved', 'revoked')) OR
    (OLD.account_state = 'suspended' AND NEW.account_state IN ('approved', 'revoked')) OR
    OLD.account_state = NEW.account_state
  ) THEN
    RAISE EXCEPTION 'invalid account state transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_invalid_account_state_transitions
BEFORE UPDATE OF account_state ON users
FOR EACH ROW EXECUTE FUNCTION enforce_account_state_transition();

COMMIT;


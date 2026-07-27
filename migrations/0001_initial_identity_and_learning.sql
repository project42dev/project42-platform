PRAGMA foreign_keys = ON;

CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  display_name TEXT,
  primary_email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  account_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (account_state IN ('pending', 'approved', 'suspended', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE user_identities (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, issuer, subject),
  UNIQUE (installation_id, user_id)
) STRICT;

CREATE TABLE role_assignments (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('learner', 'owner')),
  assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id, role)
) STRICT;

CREATE TABLE approved_email_domains (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (installation_id, domain)
) STRICT;

CREATE TABLE approval_decisions (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_state TEXT CHECK (
    from_state IS NULL OR from_state IN ('pending', 'approved', 'suspended', 'revoked')
  ),
  to_state TEXT NOT NULL CHECK (to_state IN ('pending', 'approved', 'suspended', 'revoked')),
  decision_kind TEXT NOT NULL CHECK (
    decision_kind IN ('registration', 'domain-auto-approval', 'owner-decision')
  ),
  reason TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  domain_rule_id TEXT REFERENCES approved_email_domains(id) ON DELETE SET NULL,
  decided_at TEXT NOT NULL
) STRICT;

CREATE TABLE learning_progress (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  progress_json TEXT NOT NULL CHECK (json_valid(progress_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id)
) STRICT;

CREATE TABLE module_progress (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  content_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('visited', 'completed')),
  first_seen_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id, path_id, module_id, content_version)
) STRICT;

CREATE TABLE assessment_attempts (
  id TEXT NOT NULL,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  content_version TEXT NOT NULL,
  score_percent REAL NOT NULL CHECK (score_percent >= 0 AND score_percent <= 100),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  completed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id, id)
) STRICT;

CREATE TABLE transcript_entries (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path_id TEXT NOT NULL,
  path_title TEXT NOT NULL,
  completed_modules INTEGER NOT NULL CHECK (completed_modules >= 0),
  total_modules INTEGER NOT NULL CHECK (total_modules >= 0),
  completion_percent REAL NOT NULL CHECK (
    completion_percent >= 0 AND completion_percent <= 100
  ),
  best_score_percent REAL CHECK (
    best_score_percent IS NULL OR
    (best_score_percent >= 0 AND best_score_percent <= 100)
  ),
  content_version TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id, path_id, content_version)
) STRICT;

CREATE TABLE badge_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  definition_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE user_badges (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  evidence_module_ids_json TEXT NOT NULL CHECK (json_valid(evidence_module_ids_json)),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id, badge_id)
) STRICT;

CREATE TABLE progress_imports (
  id TEXT NOT NULL,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('browser-local-v1', 'project42-portable-json')),
  source_checksum TEXT NOT NULL,
  imported_revision INTEGER NOT NULL CHECK (imported_revision > 0),
  imported_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id, id)
) STRICT;

CREATE TABLE audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_issuer TEXT,
  actor_subject TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  request_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failed')),
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  occurred_at TEXT NOT NULL
) STRICT;

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('granted', 'withdrawn')),
  decided_at TEXT NOT NULL
) STRICT;

CREATE TABLE deletion_requests (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('requested', 'cancelled', 'processing', 'completed')),
  requested_at TEXT NOT NULL,
  cancellation_deadline TEXT NOT NULL,
  completed_at TEXT
) STRICT;

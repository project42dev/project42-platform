PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE user_identities_v2 (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (
    length(provider) BETWEEN 1 AND 50 AND provider = lower(provider)
  ),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_login TEXT,
  display_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'unlinked')),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  link_method TEXT NOT NULL CHECK (
    link_method IN ('registration', 'self-service', 'owner-recovery', 'merge')
  ),
  linked_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  unlinked_at TEXT,
  UNIQUE (installation_id, provider, issuer, subject)
) STRICT;

INSERT INTO user_identities_v2 (
  id, installation_id, provider, issuer, subject, user_id, provider_login,
  display_name, status, is_primary, link_method, linked_at, last_verified_at,
  last_seen_at, unlinked_at
)
SELECT
  lower(hex(randomblob(16))),
  installation_id,
  'oidc',
  issuer,
  subject,
  user_id,
  NULL,
  NULL,
  'active',
  1,
  'registration',
  last_seen_at,
  last_seen_at,
  last_seen_at,
  NULL
FROM user_identities;

DROP TABLE user_identities;
ALTER TABLE user_identities_v2 RENAME TO user_identities;

CREATE INDEX identities_by_user
  ON user_identities (installation_id, user_id, status, linked_at);

CREATE UNIQUE INDEX one_primary_identity_per_user
  ON user_identities (installation_id, user_id)
  WHERE is_primary = 1 AND status = 'active';

CREATE TABLE identity_link_transactions (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (
    length(provider) BETWEEN 1 AND 50 AND provider = lower(provider)
  ),
  state_digest TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL CHECK (code_challenge_method = 'S256'),
  return_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'pending', 'processing', 'completed', 'cancelled', 'expired', 'failed'
    )
  ),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  request_id TEXT NOT NULL,
  UNIQUE (installation_id, state_digest)
) STRICT;

CREATE INDEX identity_link_transactions_by_user
  ON identity_link_transactions (
    installation_id, user_id, status, expires_at
  );

CREATE TABLE deleted_identity_tombstones (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  issuer_digest TEXT NOT NULL,
  subject_digest TEXT NOT NULL,
  deletion_request_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE (installation_id, provider, issuer_digest, subject_digest),
  FOREIGN KEY (deletion_request_id)
    REFERENCES deletion_tombstones(deletion_request_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX deleted_identity_tombstones_by_deletion
  ON deleted_identity_tombstones (
    installation_id, deletion_request_id, completed_at
  );

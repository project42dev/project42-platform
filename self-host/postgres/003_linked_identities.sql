BEGIN;

ALTER TABLE user_identities RENAME TO user_identities_legacy;

CREATE TABLE user_identities (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (
    length(provider) BETWEEN 1 AND 50 AND provider = lower(provider)
  ),
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_login text,
  display_name text,
  status text NOT NULL CHECK (status IN ('active', 'unlinked')),
  is_primary integer NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  link_method text NOT NULL CHECK (
    link_method IN ('registration', 'self-service', 'owner-recovery', 'merge')
  ),
  linked_at timestamptz NOT NULL,
  last_verified_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  unlinked_at timestamptz,
  UNIQUE (installation_id, provider, issuer, subject)
);

INSERT INTO user_identities (
  id, installation_id, provider, issuer, subject, user_id, provider_login,
  display_name, status, is_primary, link_method, linked_at, last_verified_at,
  last_seen_at, unlinked_at
)
SELECT
  md5(random()::text || clock_timestamp()::text || issuer || subject),
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
  last_seen_at::timestamptz,
  last_seen_at::timestamptz,
  last_seen_at::timestamptz,
  NULL
FROM user_identities_legacy;

DROP TABLE user_identities_legacy;

CREATE INDEX identities_by_user
  ON user_identities (installation_id, user_id, status, linked_at);

CREATE UNIQUE INDEX one_primary_identity_per_user
  ON user_identities (installation_id, user_id)
  WHERE is_primary = 1 AND status = 'active';

CREATE TABLE identity_link_transactions (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (
    length(provider) BETWEEN 1 AND 50 AND provider = lower(provider)
  ),
  state_digest text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL CHECK (code_challenge_method = 'S256'),
  return_path text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'pending', 'processing', 'completed', 'cancelled', 'expired', 'failed'
    )
  ),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  request_id text NOT NULL,
  UNIQUE (installation_id, state_digest)
);

CREATE INDEX identity_link_transactions_by_user
  ON identity_link_transactions (
    installation_id, user_id, status, expires_at
  );

CREATE TABLE deleted_identity_tombstones (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  issuer_digest text NOT NULL,
  subject_digest text NOT NULL,
  deletion_request_id text NOT NULL
    REFERENCES deletion_tombstones(deletion_request_id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL,
  UNIQUE (installation_id, provider, issuer_digest, subject_digest)
);

CREATE INDEX deleted_identity_tombstones_by_deletion
  ON deleted_identity_tombstones (
    installation_id, deletion_request_id, completed_at
  );

COMMIT;

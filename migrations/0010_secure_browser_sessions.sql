CREATE TABLE oidc_authorization_transactions (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  state_digest TEXT NOT NULL CHECK (length(state_digest) = 64),
  nonce_digest TEXT NOT NULL CHECK (length(nonce_digest) = 64),
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT CHECK (
    consumed_at IS NULL OR
    (consumed_at >= created_at AND consumed_at <= expires_at)
  ),
  CHECK (expires_at > created_at),
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE,
  UNIQUE (installation_id, state_digest)
) STRICT;

CREATE INDEX oidc_transactions_by_expiry
  ON oidc_authorization_transactions (installation_id, expires_at, consumed_at);

CREATE TABLE browser_sessions (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_digest TEXT NOT NULL CHECK (length(token_digest) = 64),
  identity_issuer TEXT NOT NULL,
  identity_subject TEXT NOT NULL,
  authenticated_at INTEGER NOT NULL CHECK (authenticated_at > 0),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  replaced_by_session_id TEXT,
  CHECK (last_seen_at >= created_at),
  CHECK (expires_at > created_at),
  CHECK (absolute_expires_at >= expires_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (replaced_by_session_id IS NULL OR revoked_at IS NOT NULL),
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by_session_id) REFERENCES browser_sessions(id),
  UNIQUE (installation_id, token_digest)
) STRICT;

CREATE INDEX browser_sessions_by_user
  ON browser_sessions (
    installation_id,
    user_id,
    revoked_at,
    expires_at,
    absolute_expires_at
  );

CREATE TRIGGER block_browser_session_token_rebinding
BEFORE UPDATE OF token_digest ON browser_sessions
WHEN OLD.token_digest <> NEW.token_digest
BEGIN
  SELECT RAISE(ABORT, 'browser session token digest is immutable');
END;

CREATE TRIGGER block_browser_session_identity_rebinding
BEFORE UPDATE OF installation_id, user_id, identity_issuer, identity_subject
ON browser_sessions
WHEN
  OLD.installation_id <> NEW.installation_id OR
  OLD.user_id <> NEW.user_id OR
  OLD.identity_issuer <> NEW.identity_issuer OR
  OLD.identity_subject <> NEW.identity_subject
BEGIN
  SELECT RAISE(ABORT, 'browser session identity is immutable');
END;

CREATE TRIGGER enforce_browser_session_installation
BEFORE INSERT ON browser_sessions
WHEN NOT EXISTS (
  SELECT 1
    FROM users
   WHERE id = NEW.user_id
     AND installation_id = NEW.installation_id
)
BEGIN
  SELECT RAISE(ABORT, 'browser session user belongs to another installation');
END;

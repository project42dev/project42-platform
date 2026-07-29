CREATE TABLE oidc_authorization_transactions (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  state_digest TEXT NOT NULL CHECK (length(state_digest) = 64),
  nonce_digest TEXT NOT NULL CHECK (length(nonce_digest) = 64),
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ CHECK (
    consumed_at IS NULL OR
    (consumed_at >= created_at AND consumed_at <= expires_at)
  ),
  CHECK (expires_at > created_at),
  UNIQUE (installation_id, state_digest)
);

CREATE INDEX oidc_transactions_by_expiry
  ON oidc_authorization_transactions (installation_id, expires_at, consumed_at);

CREATE TABLE browser_sessions (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  token_digest TEXT NOT NULL CHECK (length(token_digest) = 64),
  identity_issuer TEXT NOT NULL,
  identity_subject TEXT NOT NULL,
  authenticated_at BIGINT NOT NULL CHECK (authenticated_at > 0),
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_session_id TEXT REFERENCES browser_sessions(id),
  CHECK (last_seen_at >= created_at),
  CHECK (expires_at > created_at),
  CHECK (absolute_expires_at >= expires_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (replaced_by_session_id IS NULL OR revoked_at IS NOT NULL),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (installation_id, token_digest)
);

CREATE INDEX browser_sessions_by_user
  ON browser_sessions (
    installation_id,
    user_id,
    revoked_at,
    expires_at,
    absolute_expires_at
  );

CREATE FUNCTION block_browser_session_rebinding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    OLD.token_digest <> NEW.token_digest OR
    OLD.installation_id <> NEW.installation_id OR
    OLD.user_id <> NEW.user_id OR
    OLD.identity_issuer <> NEW.identity_issuer OR
    OLD.identity_subject <> NEW.identity_subject
  THEN
    RAISE EXCEPTION 'browser session identity and token digest are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER block_browser_session_rebinding
BEFORE UPDATE ON browser_sessions
FOR EACH ROW
EXECUTE FUNCTION block_browser_session_rebinding();

CREATE FUNCTION enforce_browser_session_installation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM users
     WHERE id = NEW.user_id
       AND installation_id = NEW.installation_id
  ) THEN
    RAISE EXCEPTION 'browser session user belongs to another installation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_browser_session_installation
BEFORE INSERT OR UPDATE OF installation_id, user_id ON browser_sessions
FOR EACH ROW
EXECUTE FUNCTION enforce_browser_session_installation();

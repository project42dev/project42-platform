BEGIN;

ALTER TABLE users
  ADD COLUMN state_revision integer NOT NULL DEFAULT 1
    CHECK (state_revision > 0),
  ADD COLUMN state_transition_id text,
  ADD COLUMN registration_receipt_revision integer NOT NULL DEFAULT 0
    CHECK (registration_receipt_revision >= 0),
  ADD COLUMN active_registration_request_id text;

ALTER TABLE approval_decisions
  ADD COLUMN transition_id text;

CREATE UNIQUE INDEX approval_decisions_by_transition
  ON approval_decisions (installation_id, transition_id)
  WHERE transition_id IS NOT NULL;

CREATE FUNCTION require_atomic_owner_account_transition() RETURNS trigger AS $$
BEGIN
  IF (
    NEW.decision_kind = 'owner-decision' AND
    NEW.from_state IS NOT NULL AND (
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
  ) THEN
    RAISE EXCEPTION 'stale owner account state transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER require_atomic_owner_account_transition
BEFORE INSERT ON approval_decisions
FOR EACH ROW EXECUTE FUNCTION require_atomic_owner_account_transition();

CREATE TABLE registration_requests (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receipt_token_digest text NOT NULL CHECK (length(receipt_token_digest) = 64),
  requested_at text NOT NULL,
  last_seen_at text NOT NULL,
  expires_at text NOT NULL,
  revoked_at text,
  replaced_by_request_id text REFERENCES registration_requests(id),
  CHECK (last_seen_at >= requested_at),
  CHECK (expires_at > requested_at),
  CHECK (revoked_at IS NULL OR revoked_at >= requested_at),
  CHECK (replaced_by_request_id IS NULL OR revoked_at IS NOT NULL),
  UNIQUE (installation_id, receipt_token_digest)
);

CREATE INDEX registration_requests_by_user
  ON registration_requests (
    installation_id,
    user_id,
    revoked_at,
    expires_at
  );

CREATE UNIQUE INDEX one_active_registration_request_per_user
  ON registration_requests (installation_id, user_id)
  WHERE revoked_at IS NULL;

CREATE FUNCTION block_registration_receipt_rebinding() RETURNS trigger AS $$
BEGIN
  IF (
    OLD.installation_id <> NEW.installation_id OR
    OLD.user_id <> NEW.user_id OR
    OLD.receipt_token_digest <> NEW.receipt_token_digest
  ) THEN
    RAISE EXCEPTION 'registration receipt identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_registration_receipt_rebinding
BEFORE UPDATE OF installation_id, user_id, receipt_token_digest
ON registration_requests
FOR EACH ROW EXECUTE FUNCTION block_registration_receipt_rebinding();

CREATE FUNCTION enforce_registration_request_installation() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM users
     WHERE id = NEW.user_id
       AND installation_id = NEW.installation_id
  ) THEN
    RAISE EXCEPTION 'registration request user belongs to another installation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_registration_request_installation
BEFORE INSERT ON registration_requests
FOR EACH ROW EXECUTE FUNCTION enforce_registration_request_installation();

CREATE FUNCTION require_active_registration_request_marker() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM users
     WHERE id = NEW.user_id
       AND installation_id = NEW.installation_id
       AND active_registration_request_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'stale registration request receipt';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER require_active_registration_request_marker
BEFORE INSERT ON registration_requests
FOR EACH ROW EXECUTE FUNCTION require_active_registration_request_marker();

COMMIT;

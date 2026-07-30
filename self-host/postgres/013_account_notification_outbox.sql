BEGIN;

CREATE TABLE account_notifications (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (
    kind IN (
      'registration-receipt',
      'owner-registration-alert',
      'learner-approved',
      'learner-rejected',
      'learner-suspended',
      'learner-revoked'
    )
  ),
  state text NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'delivering', 'delivered', 'retryable', 'dead-letter')
  ),
  template_version text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) = 64),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (
    max_attempts > 0 AND max_attempts <= 20
  ),
  available_at text NOT NULL,
  lease_token text,
  lease_expires_at text,
  last_error_code text,
  delivered_at text,
  replay_of_notification_id text REFERENCES account_notifications(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  CHECK (
    (state = 'delivering' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (state <> 'delivering' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (
    (state = 'delivered' AND delivered_at IS NOT NULL)
    OR
    (state <> 'delivered' AND delivered_at IS NULL)
  ),
  UNIQUE (installation_id, idempotency_key),
  UNIQUE (installation_id, replay_of_notification_id)
);

CREATE INDEX account_notifications_delivery_queue
  ON account_notifications (
    installation_id,
    state,
    available_at,
    created_at,
    id
  );

CREATE INDEX account_notifications_recipient_history
  ON account_notifications (
    installation_id,
    recipient_user_id,
    created_at,
    id
  );

CREATE INDEX account_notifications_subject_history
  ON account_notifications (
    installation_id,
    subject_user_id,
    created_at,
    id
  );

CREATE FUNCTION enforce_account_notification_installation() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
     WHERE id = NEW.recipient_user_id
       AND installation_id = NEW.installation_id
  ) OR NOT EXISTS (
    SELECT 1 FROM users
     WHERE id = NEW.subject_user_id
       AND installation_id = NEW.installation_id
  ) OR (
    NEW.replay_of_notification_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM account_notifications
       WHERE id = NEW.replay_of_notification_id
         AND installation_id = NEW.installation_id
         AND state = 'dead-letter'
    )
  ) THEN
    RAISE EXCEPTION 'account notification user belongs to another installation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER account_notification_installation_guard
BEFORE INSERT ON account_notifications
FOR EACH ROW EXECUTE FUNCTION enforce_account_notification_installation();

CREATE FUNCTION guard_account_notification_update() RETURNS trigger AS $$
BEGIN
  IF (
    OLD.installation_id <> NEW.installation_id OR
    OLD.recipient_user_id <> NEW.recipient_user_id OR
    OLD.subject_user_id <> NEW.subject_user_id OR
    OLD.kind <> NEW.kind OR
    OLD.template_version <> NEW.template_version OR
    OLD.idempotency_key <> NEW.idempotency_key OR
    OLD.replay_of_notification_id IS DISTINCT FROM NEW.replay_of_notification_id OR
    OLD.created_at <> NEW.created_at
  ) THEN
    RAISE EXCEPTION 'account notification identity is immutable';
  END IF;
  IF OLD.state IN ('delivered', 'dead-letter') THEN
    RAISE EXCEPTION 'account notification is terminal';
  END IF;
  IF NOT (
    OLD.state = NEW.state OR
    (OLD.state IN ('pending', 'retryable') AND NEW.state = 'delivering') OR
    (
      OLD.state = 'delivering' AND
      NEW.state IN ('delivered', 'retryable', 'dead-letter')
    )
  ) THEN
    RAISE EXCEPTION 'invalid account notification state transition';
  END IF;
  IF NEW.attempt_count < OLD.attempt_count OR NEW.attempt_count > OLD.max_attempts THEN
    RAISE EXCEPTION 'invalid account notification attempt count';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER account_notification_update_guard
BEFORE UPDATE ON account_notifications
FOR EACH ROW EXECUTE FUNCTION guard_account_notification_update();

CREATE TABLE account_notification_fanouts (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  subject_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind = 'owner-registration-alert'),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'complete')),
  cursor_owner_user_id text,
  recipient_cutoff_at text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) = 64),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE (installation_id, idempotency_key)
);

CREATE INDEX account_notification_fanouts_pending
  ON account_notification_fanouts (
    installation_id,
    state,
    created_at,
    id
  );

CREATE FUNCTION guard_account_notification_fanout() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM users
       WHERE id = NEW.subject_user_id
         AND installation_id = NEW.installation_id
    ) THEN
      RAISE EXCEPTION 'account notification fanout user belongs to another installation';
    END IF;
    RETURN NEW;
  END IF;
  IF (
    OLD.installation_id <> NEW.installation_id OR
    OLD.subject_user_id <> NEW.subject_user_id OR
    OLD.kind <> NEW.kind OR
    OLD.idempotency_key <> NEW.idempotency_key OR
    OLD.created_at <> NEW.created_at
  ) THEN
    RAISE EXCEPTION 'account notification fanout identity is immutable';
  END IF;
  IF OLD.state = 'complete' THEN
    RAISE EXCEPTION 'account notification fanout is terminal';
  END IF;
  IF (
    OLD.cursor_owner_user_id IS NOT NULL AND (
      NEW.cursor_owner_user_id IS NULL OR
      NEW.cursor_owner_user_id <= OLD.cursor_owner_user_id
    )
  ) THEN
    RAISE EXCEPTION 'account notification fanout cursor must advance';
  END IF;
  IF (
    OLD.recipient_cutoff_at IS NOT NULL AND
    OLD.recipient_cutoff_at IS DISTINCT FROM NEW.recipient_cutoff_at
  ) THEN
    RAISE EXCEPTION 'account notification fanout recipient cutoff is immutable';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'account notification fanout revision must advance once';
  END IF;
  IF NOT (
    OLD.state = NEW.state OR
    (OLD.state = 'pending' AND NEW.state = 'complete')
  ) THEN
    RAISE EXCEPTION 'invalid account notification fanout state transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER account_notification_fanout_insert_guard
BEFORE INSERT ON account_notification_fanouts
FOR EACH ROW EXECUTE FUNCTION guard_account_notification_fanout();

CREATE TRIGGER account_notification_fanout_update_guard
BEFORE UPDATE ON account_notification_fanouts
FOR EACH ROW EXECUTE FUNCTION guard_account_notification_fanout();

COMMIT;

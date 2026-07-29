CREATE TABLE account_notifications (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'registration-receipt',
      'owner-registration-alert',
      'learner-approved',
      'learner-rejected',
      'learner-suspended',
      'learner-revoked'
    )
  ),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'delivering', 'delivered', 'retryable', 'dead-letter')
  ),
  template_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) = 64),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (
    max_attempts > 0 AND max_attempts <= 20
  ),
  available_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
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
  UNIQUE (installation_id, idempotency_key)
) STRICT;

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

CREATE TRIGGER account_notification_installation_guard
BEFORE INSERT ON account_notifications
WHEN NOT EXISTS (
  SELECT 1 FROM users
   WHERE id = NEW.recipient_user_id
     AND installation_id = NEW.installation_id
) OR NOT EXISTS (
  SELECT 1 FROM users
   WHERE id = NEW.subject_user_id
     AND installation_id = NEW.installation_id
)
BEGIN
  SELECT RAISE(ABORT, 'account notification user belongs to another installation');
END;

CREATE TRIGGER account_notification_identity_is_immutable
BEFORE UPDATE OF
  installation_id,
  recipient_user_id,
  subject_user_id,
  kind,
  template_version,
  idempotency_key,
  created_at
ON account_notifications
BEGIN
  SELECT RAISE(ABORT, 'account notification identity is immutable');
END;

CREATE TRIGGER account_notification_state_transition_guard
BEFORE UPDATE OF state ON account_notifications
WHEN NOT (
  OLD.state = NEW.state OR
  (OLD.state IN ('pending', 'retryable') AND NEW.state = 'delivering') OR
  (
    OLD.state = 'delivering' AND
    NEW.state IN ('delivered', 'retryable', 'dead-letter')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid account notification state transition');
END;

CREATE TRIGGER account_notification_attempt_guard
BEFORE UPDATE OF attempt_count ON account_notifications
WHEN NEW.attempt_count < OLD.attempt_count OR NEW.attempt_count > OLD.max_attempts
BEGIN
  SELECT RAISE(ABORT, 'invalid account notification attempt count');
END;

CREATE TRIGGER account_notification_terminal_guard
BEFORE UPDATE ON account_notifications
WHEN OLD.state IN ('delivered', 'dead-letter')
BEGIN
  SELECT RAISE(ABORT, 'account notification is terminal');
END;

CREATE TABLE account_notification_fanouts (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  subject_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind = 'owner-registration-alert'),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'complete')),
  cursor_owner_user_id TEXT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) = 64),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (installation_id, idempotency_key)
) STRICT;

CREATE INDEX account_notification_fanouts_pending
  ON account_notification_fanouts (
    installation_id,
    state,
    created_at,
    id
  );

CREATE TRIGGER account_notification_fanout_installation_guard
BEFORE INSERT ON account_notification_fanouts
WHEN NOT EXISTS (
  SELECT 1 FROM users
   WHERE id = NEW.subject_user_id
     AND installation_id = NEW.installation_id
)
BEGIN
  SELECT RAISE(ABORT, 'account notification fanout user belongs to another installation');
END;

CREATE TRIGGER account_notification_fanout_identity_is_immutable
BEFORE UPDATE OF
  installation_id,
  subject_user_id,
  kind,
  idempotency_key,
  created_at
ON account_notification_fanouts
BEGIN
  SELECT RAISE(ABORT, 'account notification fanout identity is immutable');
END;

CREATE TRIGGER account_notification_fanout_cursor_guard
BEFORE UPDATE OF cursor_owner_user_id ON account_notification_fanouts
WHEN OLD.cursor_owner_user_id IS NOT NULL AND (
  NEW.cursor_owner_user_id IS NULL OR
  NEW.cursor_owner_user_id <= OLD.cursor_owner_user_id
)
BEGIN
  SELECT RAISE(ABORT, 'account notification fanout cursor must advance');
END;

CREATE TRIGGER account_notification_fanout_revision_guard
BEFORE UPDATE OF revision ON account_notification_fanouts
WHEN NEW.revision <> OLD.revision + 1
BEGIN
  SELECT RAISE(ABORT, 'account notification fanout revision must advance once');
END;

CREATE TRIGGER account_notification_fanout_state_guard
BEFORE UPDATE OF state ON account_notification_fanouts
WHEN NOT (
  OLD.state = NEW.state OR
  (OLD.state = 'pending' AND NEW.state = 'complete')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid account notification fanout state transition');
END;

CREATE TRIGGER account_notification_fanout_terminal_guard
BEFORE UPDATE ON account_notification_fanouts
WHEN OLD.state = 'complete'
BEGIN
  SELECT RAISE(ABORT, 'account notification fanout is terminal');
END;

CREATE TABLE account_merge_governance_constraints (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  constraint_kind TEXT NOT NULL CHECK (
    constraint_kind IN ('retention-policy', 'legal-hold')
  ),
  policy_key TEXT NOT NULL CHECK (
    length(policy_key) BETWEEN 1 AND 128
  ),
  policy_version TEXT NOT NULL CHECK (
    length(policy_version) BETWEEN 1 AND 128
  ),
  reference_digest TEXT NOT NULL CHECK (
    length(reference_digest) = 64 AND
    reference_digest NOT GLOB '*[^0-9a-f]*'
  ),
  state TEXT NOT NULL CHECK (state IN ('active', 'released')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  released_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  released_at TEXT,
  CHECK (
    (state = 'active' AND released_at IS NULL) OR
    (state = 'released' AND released_at IS NOT NULL)
  ),
  CHECK (updated_at >= created_at),
  CHECK (released_at IS NULL OR released_at >= created_at)
) STRICT;

CREATE INDEX account_merge_constraints_by_user
  ON account_merge_governance_constraints (
    installation_id, user_id, state, constraint_kind, policy_key
  );

CREATE UNIQUE INDEX one_active_account_merge_constraint
  ON account_merge_governance_constraints (
    installation_id, user_id, constraint_kind, policy_key, policy_version
  )
  WHERE state = 'active';

CREATE TRIGGER enforce_account_merge_constraint_installation_on_insert
BEFORE INSERT ON account_merge_governance_constraints
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
    FROM users
   WHERE id = NEW.user_id
     AND installation_id = NEW.installation_id
)
BEGIN
  SELECT RAISE(
    ABORT,
    'account merge constraint user belongs to another installation'
  );
END;

CREATE TRIGGER enforce_account_merge_constraint_installation_on_update
BEFORE UPDATE OF installation_id, user_id
ON account_merge_governance_constraints
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
    FROM users
   WHERE id = NEW.user_id
     AND installation_id = NEW.installation_id
)
BEGIN
  SELECT RAISE(
    ABORT,
    'account merge constraint user belongs to another installation'
  );
END;

CREATE TRIGGER enforce_account_merge_constraint_authority_on_insert
BEFORE INSERT ON account_merge_governance_constraints
FOR EACH ROW
WHEN
  (
    NEW.created_by_user_id IS NOT NULL AND
    NOT EXISTS (
      SELECT 1
        FROM users
       WHERE id = NEW.created_by_user_id
         AND installation_id = NEW.installation_id
    )
  ) OR (
    NEW.released_by_user_id IS NOT NULL AND
    NOT EXISTS (
      SELECT 1
        FROM users
       WHERE id = NEW.released_by_user_id
         AND installation_id = NEW.installation_id
    )
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'account merge constraint authority belongs to another installation'
  );
END;

CREATE TRIGGER enforce_account_merge_constraint_authority_on_update
BEFORE UPDATE OF installation_id, created_by_user_id, released_by_user_id
ON account_merge_governance_constraints
FOR EACH ROW
WHEN
  (
    NEW.created_by_user_id IS NOT NULL AND
    (
      NEW.installation_id IS NOT OLD.installation_id OR
      NEW.created_by_user_id IS NOT OLD.created_by_user_id
    ) AND
    NOT EXISTS (
      SELECT 1
        FROM users
       WHERE id = NEW.created_by_user_id
         AND installation_id = NEW.installation_id
    )
  ) OR (
    NEW.released_by_user_id IS NOT NULL AND
    (
      NEW.installation_id IS NOT OLD.installation_id OR
      NEW.released_by_user_id IS NOT OLD.released_by_user_id
    ) AND
    NOT EXISTS (
      SELECT 1
        FROM users
       WHERE id = NEW.released_by_user_id
         AND installation_id = NEW.installation_id
    )
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'account merge constraint authority belongs to another installation'
  );
END;

CREATE TRIGGER account_merge_constraint_evidence_is_immutable
BEFORE UPDATE OF
  installation_id,
  constraint_kind,
  policy_key,
  policy_version,
  reference_digest,
  created_at
ON account_merge_governance_constraints
FOR EACH ROW
BEGIN
  SELECT RAISE(
    ABORT,
    'account merge constraint evidence is immutable'
  );
END;

CREATE TRIGGER account_merge_constraint_creator_cannot_be_rebound
BEFORE UPDATE OF created_by_user_id
ON account_merge_governance_constraints
FOR EACH ROW
WHEN
  NEW.created_by_user_id IS NOT OLD.created_by_user_id AND
  NEW.created_by_user_id IS NOT NULL
BEGIN
  SELECT RAISE(
    ABORT,
    'account merge constraint creator cannot be rebound'
  );
END;

CREATE TRIGGER account_merge_constraint_release_is_terminal
BEFORE UPDATE OF state, updated_at, released_by_user_id, released_at
ON account_merge_governance_constraints
FOR EACH ROW
WHEN NOT (
  (
    NEW.state IS OLD.state AND
    NEW.updated_at IS OLD.updated_at AND
    NEW.released_at IS OLD.released_at AND
    (
      NEW.released_by_user_id IS OLD.released_by_user_id OR
      NEW.released_by_user_id IS NULL
    )
  ) OR (
    OLD.state = 'active' AND
    NEW.state = 'released' AND
    NEW.updated_at = NEW.released_at AND
    NEW.released_at IS NOT NULL AND
    NEW.released_by_user_id IS NOT NULL
  )
)
BEGIN
  SELECT RAISE(
    ABORT,
    'account merge constraint release is terminal'
  );
END;

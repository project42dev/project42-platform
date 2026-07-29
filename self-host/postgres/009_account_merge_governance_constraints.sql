CREATE TABLE account_merge_governance_constraints (
  id text PRIMARY KEY,
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  constraint_kind text NOT NULL CHECK (
    constraint_kind IN ('retention-policy', 'legal-hold')
  ),
  policy_key text NOT NULL CHECK (char_length(policy_key) BETWEEN 1 AND 128),
  policy_version text NOT NULL CHECK (
    char_length(policy_version) BETWEEN 1 AND 128
  ),
  reference_digest text NOT NULL CHECK (
    reference_digest ~ '^[0-9a-f]{64}$'
  ),
  state text NOT NULL CHECK (state IN ('active', 'released')),
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  released_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  released_at timestamptz,
  CHECK (
    (state = 'active' AND released_at IS NULL) OR
    (state = 'released' AND released_at IS NOT NULL)
  ),
  CHECK (updated_at >= created_at),
  CHECK (released_at IS NULL OR released_at >= created_at)
);

CREATE INDEX account_merge_constraints_by_user
  ON account_merge_governance_constraints (
    installation_id, user_id, state, constraint_kind, policy_key
  );

CREATE UNIQUE INDEX one_active_account_merge_constraint
  ON account_merge_governance_constraints (
    installation_id, user_id, constraint_kind, policy_key, policy_version
  )
  WHERE state = 'active';

CREATE OR REPLACE FUNCTION enforce_account_merge_constraint_installation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  user_binding_changed boolean := true;
  creator_binding_changed boolean := true;
  releaser_binding_changed boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    user_binding_changed :=
      NEW.installation_id IS DISTINCT FROM OLD.installation_id OR
      NEW.user_id IS DISTINCT FROM OLD.user_id;
    creator_binding_changed :=
      NEW.installation_id IS DISTINCT FROM OLD.installation_id OR
      NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id;
    releaser_binding_changed :=
      NEW.installation_id IS DISTINCT FROM OLD.installation_id OR
      NEW.released_by_user_id IS DISTINCT FROM OLD.released_by_user_id;
  END IF;
  IF
    user_binding_changed AND
    NOT EXISTS (
      SELECT 1
        FROM users
       WHERE id = NEW.user_id
         AND installation_id = NEW.installation_id
    )
  THEN
    RAISE EXCEPTION
      'account merge constraint user belongs to another installation';
  END IF;
  IF
    NEW.created_by_user_id IS NOT NULL AND
    creator_binding_changed AND
    NOT EXISTS (
      SELECT 1
        FROM users
       WHERE id = NEW.created_by_user_id
         AND installation_id = NEW.installation_id
    )
  THEN
    RAISE EXCEPTION
      'account merge constraint authority belongs to another installation';
  END IF;
  IF
    NEW.released_by_user_id IS NOT NULL AND
    releaser_binding_changed AND
    NOT EXISTS (
      SELECT 1
        FROM users
       WHERE id = NEW.released_by_user_id
         AND installation_id = NEW.installation_id
    )
  THEN
    RAISE EXCEPTION
      'account merge constraint authority belongs to another installation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_account_merge_constraint_installation
BEFORE INSERT OR UPDATE OF
  installation_id,
  user_id,
  created_by_user_id,
  released_by_user_id
ON account_merge_governance_constraints
FOR EACH ROW EXECUTE FUNCTION enforce_account_merge_constraint_installation();

CREATE OR REPLACE FUNCTION enforce_account_merge_constraint_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    NEW.installation_id IS DISTINCT FROM OLD.installation_id OR
    NEW.constraint_kind IS DISTINCT FROM OLD.constraint_kind OR
    NEW.policy_key IS DISTINCT FROM OLD.policy_key OR
    NEW.policy_version IS DISTINCT FROM OLD.policy_version OR
    NEW.reference_digest IS DISTINCT FROM OLD.reference_digest OR
    (
      NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id AND
      NEW.created_by_user_id IS NOT NULL
    ) OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'account merge constraint evidence is immutable';
  END IF;
  IF
    NEW.state IS DISTINCT FROM OLD.state OR
    NEW.updated_at IS DISTINCT FROM OLD.updated_at OR
    NEW.released_by_user_id IS DISTINCT FROM OLD.released_by_user_id OR
    NEW.released_at IS DISTINCT FROM OLD.released_at
  THEN
    IF NOT (
      (
        OLD.state = 'active' AND
        NEW.state = 'released' AND
        NEW.updated_at = NEW.released_at AND
        NEW.released_at IS NOT NULL AND
        NEW.released_by_user_id IS NOT NULL
      ) OR (
        NEW.state IS NOT DISTINCT FROM OLD.state AND
        NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at AND
        NEW.released_at IS NOT DISTINCT FROM OLD.released_at AND
        OLD.released_by_user_id IS NOT NULL AND
        NEW.released_by_user_id IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'account merge constraint release is terminal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_account_merge_constraint_update
BEFORE UPDATE ON account_merge_governance_constraints
FOR EACH ROW EXECUTE FUNCTION enforce_account_merge_constraint_update();

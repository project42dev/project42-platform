ALTER TABLE user_profiles
  ADD COLUMN locale TEXT CHECK (locale IS NULL OR length(locale) BETWEEN 2 AND 35);

ALTER TABLE user_profiles
  ADD COLUMN time_zone TEXT CHECK (
    time_zone IS NULL OR length(time_zone) BETWEEN 1 AND 100
  );

ALTER TABLE user_profiles
  ADD COLUMN reduced_motion INTEGER NOT NULL DEFAULT 0
  CHECK (reduced_motion IN (0, 1));

ALTER TABLE user_profiles
  ADD COLUMN high_contrast INTEGER NOT NULL DEFAULT 0
  CHECK (high_contrast IN (0, 1));

ALTER TABLE consent_records
  ADD COLUMN contract_status TEXT NOT NULL DEFAULT 'legacy'
  CHECK (contract_status IN ('current', 'legacy'));

UPDATE consent_records
   SET contract_status = 'current'
 WHERE purpose IN (
         'learning-record',
         'product-improvement',
         'learning-reminders'
       )
   AND policy_version = '2026-07-27';

CREATE TRIGGER consent_records_require_current_contract_on_insert
BEFORE INSERT ON consent_records
WHEN NEW.contract_status = 'current'
  AND (
    NEW.purpose NOT IN (
      'learning-record',
      'product-improvement',
      'learning-reminders'
    )
    OR NEW.policy_version <> '2026-07-27'
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'new consent records must use the current accepted purpose and policy version'
  );
END;

ALTER TABLE deletion_requests
  ADD COLUMN status_token_digest TEXT
  CHECK (status_token_digest IS NULL OR length(status_token_digest) = 64);

CREATE UNIQUE INDEX deletion_requests_by_status_token
  ON deletion_requests (installation_id, status_token_digest)
  WHERE status_token_digest IS NOT NULL;

ALTER TABLE deletion_tombstones
  ADD COLUMN status_token_digest TEXT
  CHECK (status_token_digest IS NULL OR length(status_token_digest) = 64);

ALTER TABLE deletion_tombstones
  ADD COLUMN cancellation_deadline TEXT;

CREATE UNIQUE INDEX deletion_tombstones_by_status_token
  ON deletion_tombstones (installation_id, status_token_digest)
  WHERE status_token_digest IS NOT NULL;

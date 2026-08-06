/* Allow terms-of-service acceptance records alongside consent records.
   Terms acceptance is required (not refusable) and uses its own version
   constant (TERMS_OF_SERVICE_VERSION), distinct from the learner-data
   policy version used by optional consent purposes. */

DROP TRIGGER consent_records_require_current_contract_on_insert;

CREATE TRIGGER consent_records_require_current_contract_on_insert
BEFORE INSERT ON consent_records
WHEN NEW.contract_status = 'current'
  AND NOT (
    (
      NEW.purpose IN (
        'learning-record',
        'product-improvement',
        'learning-reminders'
      )
      AND NEW.policy_version = '2026-07-27'
    )
    OR (
      NEW.purpose = 'terms-of-service'
      AND NEW.policy_version = '1.0'
    )
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'new consent records must use an accepted purpose and policy version'
  );
END;

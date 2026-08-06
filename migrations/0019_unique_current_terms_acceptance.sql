/* Terms acceptance is a one-time registration contract for each policy version.
   Keep the earliest current grant if legacy retries created duplicates, then
   enforce the invariant for both signed-in and registration-receipt flows. */

DELETE FROM consent_records
 WHERE purpose = 'terms-of-service'
   AND decision = 'granted'
   AND contract_status = 'current'
   AND id NOT IN (
     SELECT MIN(id)
       FROM consent_records
      WHERE purpose = 'terms-of-service'
        AND decision = 'granted'
        AND contract_status = 'current'
      GROUP BY installation_id, user_id, purpose, policy_version
   );

CREATE UNIQUE INDEX consent_records_one_current_terms_grant
  ON consent_records (installation_id, user_id, purpose, policy_version)
  WHERE purpose = 'terms-of-service'
    AND decision = 'granted'
    AND contract_status = 'current';
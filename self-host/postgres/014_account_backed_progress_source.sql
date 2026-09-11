BEGIN;

/* PostgreSQL parity with D1 migration 0020_account_backed_progress_source.sql.

   progress_imports has admitted only the two *import* sources since
   001_initial.sql:

     source text NOT NULL CHECK (source IN ('browser-local-v1',
                                            'project42-portable-json'))

   Every routine save the signed-in front end makes is stamped
   'account-backed-v1'. D1 migration 0020 widened its CHECK in 0.111.0; this
   schema was not touched. On a self-hosted install an account-backed save
   therefore passed the Worker's validation, reached importProgress, and
   aborted on this CHECK -- the whole batch, module_progress included, rolled
   back and nothing was recorded.

   'legacy-hosted-v1' and 'account-merge-v1' are admitted at the same time,
   exactly as 0020 does, so both stores accept the same set, which matches the
   learning-event contract's progress-import sources.
   tests/progress-import-source-parity.test.mjs fails if they drift apart.

   PostgreSQL replaces a CHECK in place; existing rows are untouched and the
   new constraint is validated against them. The DROP is deliberately not
   IF EXISTS: if the constraint were not where 001 put it, this migration must
   fail rather than leave the narrow CHECK in force. */

ALTER TABLE progress_imports
  DROP CONSTRAINT progress_imports_source_check;

ALTER TABLE progress_imports
  ADD CONSTRAINT progress_imports_source_check CHECK (
    source IN (
      'browser-local-v1',
      'project42-portable-json',
      'account-backed-v1',
      'legacy-hosted-v1',
      'account-merge-v1'
    )
  );

COMMIT;

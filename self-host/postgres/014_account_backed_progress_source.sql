BEGIN;

/* Mirrors migrations/0020_account_backed_progress_source.sql. The column CHECK
   in 001_initial.sql was declared inline, so PostgreSQL named it
   progress_imports_source_check. Drop it by that name, and defensively drop any
   other CHECK on the table that still names only the two import sources, then
   add the widened constraint under an explicit name. */

ALTER TABLE progress_imports
  DROP CONSTRAINT IF EXISTS progress_imports_source_check;

DO $$
DECLARE
  stale text;
BEGIN
  FOR stale IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'progress_imports'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%browser-local-v1%'
       AND pg_get_constraintdef(oid) NOT LIKE '%account-backed-v1%'
  LOOP
    EXECUTE format(
      'ALTER TABLE progress_imports DROP CONSTRAINT %I', stale
    );
  END LOOP;
END
$$;

ALTER TABLE progress_imports
  ADD CONSTRAINT progress_imports_source_check
  CHECK (
    source IN (
      'browser-local-v1',
      'project42-portable-json',
      'account-backed-v1'
    )
  );

COMMIT;

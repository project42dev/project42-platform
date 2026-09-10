/* The fifth place that had to agree, and the one the 2026-09-09 fix missed.

   progress_imports has carried a CHECK constraint since 0001 that names only
   the two *import* sources:

     source TEXT NOT NULL CHECK (source IN ('browser-local-v1',
                                            'project42-portable-json'))

   Every routine save the signed-in front end makes is stamped
   'account-backed-v1'. v0.110.0 added that value to the worker's allow-list,
   the API type, the learning-event source union and the event schema -- but
   not here. So the request now passes validation, reaches importProgress, and
   the whole D1 batch aborts on this CHECK. The failure moved from a silent
   400 to a silent 500; nothing reached module_progress either way. Production
   D1 still shows zero rows.

   'legacy-hosted-v1' and 'account-merge-v1' are added at the same time. Both
   are real sources the platform already writes into the learning-event log
   (getProgress promotes a legacy snapshot as 'legacy-hosted-v1'; the merge
   engine writes 'account-merge-v1'), and if either path is ever routed
   through importProgress it would abort exactly the same way. The list here
   now matches LearningProgressImportSource in src/learning-events.ts.

   SQLite cannot alter a CHECK constraint, so the table is rebuilt in place.
   Rows are preserved; the existing 2026-07-30 browser import survives. */

PRAGMA foreign_keys = ON;

CREATE TABLE progress_imports_v2 (
  id TEXT NOT NULL,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (
    source IN (
      'browser-local-v1',
      'project42-portable-json',
      'account-backed-v1',
      'legacy-hosted-v1',
      'account-merge-v1'
    )
  ),
  source_checksum TEXT NOT NULL,
  imported_revision INTEGER NOT NULL CHECK (imported_revision > 0),
  imported_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id, id)
) STRICT;

INSERT INTO progress_imports_v2 (
  id, installation_id, user_id, source, source_checksum,
  imported_revision, imported_at
)
SELECT
  id, installation_id, user_id, source, source_checksum,
  imported_revision, imported_at
FROM progress_imports;

DROP TABLE progress_imports;
ALTER TABLE progress_imports_v2 RENAME TO progress_imports;

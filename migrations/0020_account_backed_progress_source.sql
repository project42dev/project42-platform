/* The signed-in front end saves progress with source "account-backed-v1".
   v0.110.0 added that value to the API type, the worker allow-list, the
   learning-event source union and the event schema, but progress_imports
   carried its own CHECK naming only the two import sources, so the write was
   accepted and then refused by the database. SQLite cannot alter a CHECK, so
   the table is recreated. It has no indexes or triggers of its own; the
   primary key is restated below. */

PRAGMA foreign_keys = ON;

CREATE TABLE progress_imports_account_backed (
  id TEXT NOT NULL,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (
    source IN (
      'browser-local-v1',
      'project42-portable-json',
      'account-backed-v1'
    )
  ),
  source_checksum TEXT NOT NULL,
  imported_revision INTEGER NOT NULL CHECK (imported_revision > 0),
  imported_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id, id)
) STRICT;

INSERT INTO progress_imports_account_backed (
  id, installation_id, user_id, source, source_checksum,
  imported_revision, imported_at
)
SELECT
  id, installation_id, user_id, source, source_checksum,
  imported_revision, imported_at
FROM progress_imports;

DROP TABLE progress_imports;
ALTER TABLE progress_imports_account_backed RENAME TO progress_imports;

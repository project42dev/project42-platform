# Handoff

## Active branch

`feat/authoritative-progress-adapter`

## Current work

AB#6355 replaces the hosted progress API's legacy snapshot authority with the
shared append-only learning-event adapter while preserving existing browser
imports, exports, account merges, and API response compatibility.

## Implemented

- Learning-event contract `1.1` with immutable, checksum-bound
  `progress.imported` events.
- Event-backed reads for `/v1/me/progress` with lazy migration of legacy hosted
  snapshots.
- Retry-safe browser imports and explicit conflicts for reused import IDs or
  concurrent stream revisions.
- Event-backed account merge and rollback projections.
- D1 migration `0011_authoritative_progress_imports.sql` and PostgreSQL migration
  `008_authoritative_progress_imports.sql`.
- Adapter contract `1.1`, conformance coverage, public documentation, and
  self-host compatibility metadata for candidate release `0.61.0`.

## Verification

- Rebased onto platform `v0.60.0`; the D1 chain contains secure-session
  migration `0010` before authoritative-progress migration `0011`, and the
  PostgreSQL chain contains `007` before `008`.
- Complete local gate: 166 tests, 165 passed, one optional PostgreSQL integration
  test skipped because no test database was supplied.
- D1 migration replay, immutable-event enforcement, account merge/rollback,
  package build, Worker dry run, resource validation, freshness, recovery
  measurement, and self-host validation pass.
- Production dependency audit reports zero vulnerabilities.
- Package dry run contains 354 files and passes.
- Docker, PostgreSQL, and `psql` are unavailable on this workstation, so the
  Docker Compose model and live PostgreSQL 17 integration must run in CI.

## Next steps

1. Open the public pull request
   without private work-tracking links.
2. Require green PostgreSQL 17 conformance, Compose smoke, and full CI before
   merge.
3. Record evidence and close only Task AB#6355 after delivery; do not close its
   parent User Story.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this repository.

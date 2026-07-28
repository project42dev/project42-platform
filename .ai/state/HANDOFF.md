# Handoff

## Active branch

`feat/postgres-learning-receipts-ab5422`

## Current work

AB#5422 completes the PostgreSQL learning-record adapter acceptance criteria that
remain after authoritative events shipped in platform `v0.56.0`.

## Implemented

- Package candidate `0.57.0`.
- Verified export receipts binding exact scope, revision, event count, canonical
  event digest, and export time.
- Idempotent pseudonymous deletion receipts that survive record deletion without
  raw installation or learner identifiers.
- Restore-specific deletion replay receipts binding the restored event digest,
  count, deletion result, restore ID, and replay time.
- Engine authorization for verified export, deletion, and replay.
- Atomic SQL deletion and replay in the shared D1/PostgreSQL adapter.
- D1 migration `0009` and PostgreSQL migration `006` with immutable receipt rows.
- Strict JSON Schema, runtime verification, documentation, and a public receipt
  conformance harness.

## Verification

- Receipt unit tests and real Miniflare D1 conformance pass.
- The prior event conformance still covers retry-safe duplicate commands,
  concurrent distinct attempts, deterministic projection, authorization, export,
  and deletion.
- Pull-request CI must run both public suites against PostgreSQL 17 before merge.

## Next steps

1. Run the complete local platform, Worker, package, audit, and whitespace gates.
2. Commit and open the public pull request without private ADO links.
3. Require green PostgreSQL 17 conformance and full CI before merge.
4. Publish and validate signed platform release `v0.57.0`.
5. Record private evidence, return Tasks AB#6345–AB#6347 to New plus
   `Ready for Acceptance`, and move AB#5422 to Resolved without closing it.
6. Continue AB#5423 hosted adapter operating limits and configuration selection.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this repository.

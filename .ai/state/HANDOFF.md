# Handoff

## Active branch

`feat/learning-event-conformance-ab5175`

## Current work

AB#5175 implements the versioned, retry-safe authoritative learning record and
the same storage conformance suite for hosted D1 and self-hosted PostgreSQL.

## Implemented

- Package candidate `0.56.0`.
- Strict version `1.0` commands, events, JSON Schema, examples, and validation.
- Caller-generated tenant/learner-scoped idempotency with digest rebinding
  protection.
- Immutable original assessment answers and scores with append-only corrections.
- Deterministic enrollment, module, attempt, transcript, badge, export, and
  deletion projections.
- Explicit self/any read, write, and deletion authorization.
- In-memory and SQL stores with optimistic stream revisions and race-safe write
  tokens.
- Cloudflare D1 migration `0008` and PostgreSQL migration `005`.
- Public `runLearningEventStoreConformance` suite shared by both adapters.

## Verification

- Contract and engine tests pass.
- Real Miniflare D1 conformance passes retry, concurrency, immutable evidence,
  rebuild, authorization, export, and deletion.
- Full platform gate passes with the environment-gated PostgreSQL test skipped
  locally because Docker/PostgreSQL is unavailable.
- CI must run the same published harness against PostgreSQL 17 before merge.

## Next steps

1. Run the remaining release, package, API, audit, and whitespace gates.
2. Commit and open the public pull request without private ADO links.
3. Require green PostgreSQL 17 conformance and full CI before merge.
4. Publish and validate signed platform release `v0.56.0`.
5. Record private release evidence, return Tasks AB#6341-AB#6344 to New with
   `Ready for Acceptance`, and move AB#5175 to Resolved without closing it.

No production tenant, organization, owner, account, client, domain, database,
secret, or learner identifiers belong in this repository.

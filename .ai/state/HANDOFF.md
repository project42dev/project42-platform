# Handoff

## Active branch

`feat/recovery-production-like-ab5425`

## Scope

AB#5425 adds the production-like, provider-neutral recovery evidence needed to
promote restored durable learner records:

- a serialized backup artifact with adapter, migration-head, timestamp, stream,
  event, byte-count, payload SHA-256, and a canonical artifact SHA-256 binding
  every manifest value together with the exact payload;
- verification of the artifact and every embedded export before the first
  restore write;
- fail-closed rejection of corrupt, incomplete, truncated, checksum-mismatched,
  manifest-tampered, duplicate-scope, cross-adapter, wrong-migration-head, and
  schema-extension artifacts;
- exact canonical digest comparison of restored enrollments, progress,
  attempts, corrections, transcripts, badges, and mastery evidence;
- verified post-backup deletion receipt replay and empty deleted-stream proof;
- default 24-hour RPO and 8-hour RTO objectives measured with the system clock;
  and
- full recovery rehearsals against local Miniflare D1 and isolated PostgreSQL
  schemas in CI.

No production database, Cloudflare, Entra, tenant, or hosted resource is
created or mutated by this work.

## Verification state

- `npm run check` passes 252 tests: 250 passed, two optional PostgreSQL tests
  skipped locally, zero failed. It also validates 12 resource packs / 94
  resources, 50 D1 measurement streams with p95 420.92 ms, 572 freshness
  references / 60 primary sources, and the self-host compatibility manifest.
- Focused Miniflare D1 recovery tests pass, including the default system-clock
  exercise.
- `npm run api:check` passes Worker type generation and the Wrangler dry run; it
  does not deploy.
- `npm audit --audit-level=moderate` reports zero vulnerabilities.
- The dry-run package contains 685 files, including the new recovery artifact
  schema and compiled runtime, at 1,949,783 packed bytes / 9,143,041 unpacked.
- HCS app-profile validation was invoked; its review-directed type, test, and
  dependency gates are satisfied by the checks above.
- The PostgreSQL recovery test is present and runs when `TEST_POSTGRES_URL` is
  available; protected CI supplies PostgreSQL 17.
- Protected PR CI, merge, and main CI remain to be completed.

An independent pre-push review found and blocked a first implementation whose
digest covered only the payload. The corrected follow-up binds adapter,
migration head, capture and source timestamps, stream/event/byte counts, payload
digest, and exact payload into the canonical artifact digest and backup ID.
Focused tests tamper each security-relevant manifest class while keeping caller
expectations aligned and prove verification still fails before restore.

AB#5425 remains Active until those gates and evidence are complete. User
Stories are never moved to Closed by automation.

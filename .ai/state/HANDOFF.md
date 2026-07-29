# Handoff

## Active branch

`feat/authoritative-transcripts-ab5176`

Base: `111b52a96416c46d634908ea535e205e394636ca` (`origin/main`)

## Current work

- Adds explicit hosted learner-export record types.
- Adds a recent-authentication, approved-account CSV transcript route backed by
  durable account records and immutable audit evidence.
- Produces a deterministic, spreadsheet-safe CSV whose achievements are
  explicitly not issued credentials.
- Preserves the API-owned HttpOnly-cookie session contract and existing JSON,
  deletion, and authorization behavior.
- Documents the authoritative transcript contract and adds deterministic
  formatter, authorization, route-policy, D1, audit, and injection tests.

## Verification

- `npm ci` passed with zero vulnerabilities.
- Focused transcript, identity-security, approval-policy, and D1 tests passed:
  11 passed, zero failed.
- `npm run check` passed, including all platform tests, hosted learning-record
  measurements, content freshness, resource validation, and self-host checks.
- `npm run api:check` regenerated Worker types and completed a dry run; it did
  not deploy.
- `npm audit --audit-level=high` reported zero vulnerabilities.
- `git diff --check` passed.

## Delivery boundary

- This branch is a review candidate only. It must not be merged, released,
  deployed, or used to resolve a story by this workstream.
- No schema migration, production configuration, tenant/owner identifier,
  credential, learner data, Open Badges claim, or private operational value is
  included.
- Production deployment and authenticated learner validation remain separate
  owner/release gates.

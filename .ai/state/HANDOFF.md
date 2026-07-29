# Handoff

## Active branch

`feat/registration-boundary-ab5695-ab5697`

Base: `f6a5815617c8dfb4290f7edeba444c9eccb75174`

## Scope

AB#5695 and AB#5697 implement the backend registration boundary:

- pending and rejected OIDC callbacks receive a 384-bit, host-only registration
  status receipt rather than a learner browser session;
- only the SHA-256 receipt digest is stored, scoped to one installation, for at
  most 30 days;
- `GET /v1/registration/status` returns only state, timestamps, sign-in
  readiness, and a bounded next action—never profile, email, subject, or user ID;
- approved accounts alone can create or renew browser sessions;
- sessions created before this boundary for non-approved accounts are revoked
  and audited on their next use;
- suspended and revoked callbacks receive no session or receipt;
- owner decisions use expected state/revision and a database-bound transition
  marker so concurrent stale decisions cannot both commit; and
- D1 migration `0014_registration_boundary.sql` and PostgreSQL migration
  `011_registration_boundary.sql` provide equivalent storage and guard
  contracts.

No Learn UI, notification delivery, push, pull request, merge, deployment,
Cloudflare mutation, Entra mutation, or production database mutation is in this
branch.

## Verification state

- Full `npm run check` passes: 254 tests total, 252 passed, two optional
  PostgreSQL runtime tests skipped in that command, zero failed.
- The check also validates 12 resource packs / 94 resources, 50 hosted D1
  measurement streams with p95 421.58 ms, 572 freshness references / 60 primary
  sources, and the self-host compatibility manifest.
- Focused browser tests prove pending, rejected, and approved callbacks; no
  learner session for non-approved accounts; PII-free receipt status;
  protected-route bypass rejection; receipt tamper and cross-installation
  rejection; stale-session revocation/audit; and approved re-sign-in.
- A forced two-reader D1 race proves exactly one concurrent owner decision,
  state revision, transition marker, approval decision, and audit event commit.
- D1 migration replay and authorization/audit guards pass.
- Existing account lifecycle and identity-security suites pass.
- PostgreSQL 17.10 was installed temporarily in WSL and the two optional
  runtime suites plus focused registration/CAS/browser tests passed 14/14 with
  no skips. This verifies recovery, all migrations through `011`, receipt
  status, pending-session denial, approval transition, session rotation
  rollback, and D1-focused boundary cases. The isolated test database, cluster,
  packages, and temporary package source were removed afterward.
- Generator-only training artifacts produced by `npm run build` were restored
  and are intentionally excluded.

AB#5695 and AB#5697 remain Active pending cross-repository and production work.
User Stories are never moved to Closed by automation.

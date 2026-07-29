# Handoff

## Active branch

`feat/profile-consent-controls-ab5419`

The branch is based on `origin/main` commit `2064a59` and implements the
reusable-platform portion of AB#5419.

## Implemented

- Learner profiles now include validated locale, time-zone, reduced-motion,
  and high-contrast preferences in public contracts, D1/PostgreSQL schemas,
  hosted runtime behavior, exports, and account-merge recovery.
- Consent writes use the canonical purpose vocabulary and current policy
  version. Pre-contract records remain explicitly marked `legacy` and remain
  compatible with migrations, export, merge, and rollback.
- Account deletion issues a private capability receipt, stores only its
  SHA-256 digest, and exposes privacy-safe pending and completed status after
  identity and account data are erased.
- Self-scope endpoints fail closed when callers attempt to select another
  account, user, installation, or tenant. Tests cover multi-account and
  multi-install isolation and denial auditing.
- D1 migration head is `0013_profile_consent_and_deletion_receipts.sql`;
  PostgreSQL migration head is
  `010_profile_consent_and_deletion_receipts.sql`.

## Verification

- `npm run build`: passed.
- `npm test`: 246 tests, 245 passed, one optional PostgreSQL integration
  skipped, zero failures.
- `npm run training:check`: 40 class-ready, 29 outline-only.
- `npm run learning-records:measure`: passed; 50 streams, zero errors,
  p95 448.34 ms against a 1,000 ms threshold.
- `npm run content:freshness`: passed; 572 references and 60 primary sources.
- `npm run self-host:validate`: passed.
- `npm run api:check`: passed Worker type generation and Cloudflare dry run.
- `npm audit --audit-level=high`: zero vulnerabilities.

## Remaining external gates

- The optional live PostgreSQL integration did not run because no
  `TEST_POSTGRES_URL` was supplied.
- No production migration, deployment, browser integration, or representative
  learner validation was performed in this branch.
- No branch was pushed, pull request created, deployment changed, or work item
  state changed.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this repository.

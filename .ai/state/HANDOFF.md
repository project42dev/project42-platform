# Handoff

## Active branch

`chore/platform-v0.63.0-ab5419`

## Release candidate

The platform release candidate is `0.63.0`, based on `origin/main` commit
`f117a54b031ffa4a6429d0082d031feffd651a79`.

This is a minor release because main adds public learner-profile preferences,
canonical consent contracts, a deletion-status receipt, and matching hosted and
self-hosted schema changes.

## Prepared

- `package.json` and `package-lock.json` identify `0.63.0`.
- The self-host example selects `PROJECT42_VERSION=0.63.0`.
- The compatibility manifest identifies release/API/image `0.63.0`.
- The compatibility manifest retains PostgreSQL migration head
  `010_profile_consent_and_deletion_receipts.sql`.
- README release notes describe the profile preferences, consent compatibility,
  deletion receipt, self-scope authorization boundary, D1 migration
  `0013_profile_consent_and_deletion_receipts.sql`, and PostgreSQL migration
  `010_profile_consent_and_deletion_receipts.sql`.

## Verification

- `npm ci`: passed; package preparation and TypeScript build passed.
- `npm run check`: passed; 246 tests, 245 passed, one optional PostgreSQL
  integration skipped, zero failures. Resource, recovery-measurement,
  freshness, and self-host validation passed.
- Hosted learner-record measurement passed with 50 streams, zero errors, and
  p95 latency of 430.19 ms against the 1,000 ms release threshold.
- `npm run api:check`: passed Worker type generation and Cloudflare dry run.
- `npm audit --audit-level=moderate`: zero vulnerabilities.
- `npm pack --ignore-scripts --dry-run --json`: package
  `@project42/platform@0.63.0`, 662 files, both new migration files, the
  compatibility manifest, and release notes are present.
- Candidate tag expectation is `v0.63.0`.

## Outstanding release gates

- Docker is not installed in this local environment. The protected pull-request
  CI must run the live PostgreSQL integration and self-hosted Compose/Keycloak
  smoke before merge.
- The signed tag workflow must attest and sign the archive and compatibility
  manifest, publish and sign the OCI image, and create the GitHub release.
- No production migration, Worker deployment, hosted application deployment, or
  representative learner validation is part of this release-preparation branch.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this repository.

# Handoff

## Active branch

`chore/release-v0.66.0-ab6358`

Base: `b3a3079fe83498013ba2aac3076254015c7d75ae` (`origin/main`)

## Release candidate

The reusable platform release candidate is `0.66.0`. It packages the
tenant-scoped owner account and audit pagination scalability work delivered for
AB#6358.

## Prepared

- `package.json` and `package-lock.json` identify `0.66.0`.
- The self-host example selects `PROJECT42_VERSION=0.66.0`.
- The compatibility manifest identifies release, API, and OCI image `0.66.0`.
- The compatibility manifest records PostgreSQL migration head
  `012_admin_pagination_indexes.sql` while preserving learning-record contract
  `1.1` and the API-owned HttpOnly-cookie session contract v1.
- README release notes describe complete account and audit keyset indexes,
  row-scoped role aggregation, large multi-tenant traversal evidence, and the
  unchanged opaque cursor and response contracts.
- Hosted D1 migration head is `0015_admin_pagination_indexes.sql`; self-hosted
  PostgreSQL migration head is `012_admin_pagination_indexes.sql`.
- No runtime feature, schema, migration, production configuration, tenant
  identifier, owner identifier, or private operational value is introduced by
  this release preparation.

## Verification

- `npm ci` passed and reported zero vulnerabilities.
- `npm run check` passed 257 tests: 254 passed, three optional live-PostgreSQL
  tests skipped in this local command, and zero failed.
- The full gate validated 12 resource packs / 94 resources, 50 hosted D1
  measurement streams with zero errors and p95 437.89 ms against the 1,000 ms
  threshold, 572 freshness references / 60 primary sources, and self-host
  compatibility `0.66.0`.
- `npm run api:check` regenerated Worker types and completed a Wrangler dry run;
  it did not deploy.
- `npm audit --audit-level=moderate` reported zero vulnerabilities.
- `npm pack --ignore-scripts --dry-run --json` produced
  `@project42/platform@0.66.0` with 693 files, 1,958,107 packed bytes and
  9,184,883 unpacked bytes. The preview contains the compatibility manifest,
  D1 migration `0015`, PostgreSQL migration `012`, and pagination
  documentation.
- The explicit version and migration-head consistency gate passed.
- `git diff --check` and the scoped added-line private-material scan passed.
- Generator-only training artifacts and generated Worker types produced during
  validation were restored and are intentionally excluded.

## Outstanding release gates

- Protected pull-request CI must rerun PostgreSQL-backed verification and the
  self-host smoke gate against the versioned candidate.
- The signed `v0.66.0` tag workflow must attest and sign the package and
  compatibility manifest, publish and sign the OCI image, and create the GitHub
  release.
- Apply D1 migration `0015_admin_pagination_indexes.sql` with the matching
  Worker release through the approved production process.
- Validate authenticated owner account and audit traversal in production.

AB#6358 remains Active pending release, deployment, and production evidence.
Do not move it to Resolved or Closed from release preparation alone.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this
repository.

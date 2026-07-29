# Handoff

## Active branch

`chore/release-v0.65.0-ab5695-ab5697`

Base: `3f7122c9716a8bfb65bcf89515dbe7114b1af79b`

## Release candidate

The reusable platform release candidate is `0.65.0`. It packages the
provider-neutral registration and authorization boundary delivered for AB#5695
and AB#5697.

## Prepared

- `package.json` and `package-lock.json` identify `0.65.0`.
- The self-host example selects `PROJECT42_VERSION=0.65.0`.
- The compatibility manifest identifies release, API, and OCI image `0.65.0`.
- The compatibility manifest preserves PostgreSQL migration head
  `011_registration_boundary.sql`, learning-record contract `1.1`, and the
  API-owned HttpOnly-cookie session contract v1.
- README release notes describe digest-only registration status receipts,
  approved-only learner sessions, receipt and stale-session invalidation,
  explicit preapproval data-rights exceptions, atomic owner decisions, and
  D1/PostgreSQL parity.
- Hosted D1 migration head is `0014_registration_boundary.sql`; self-hosted
  PostgreSQL migration head is `011_registration_boundary.sql`.
- No feature, schema, migration, production configuration, tenant identifier,
  owner identifier, or private operational value is introduced by this release
  preparation.

## Verification

- `npm ci` passed with zero vulnerabilities.
- `npm run check` passed 255 tests: 253 passed, two optional live-PostgreSQL
  integration tests skipped in this local command, and zero failed.
- The full check validated 12 resource packs / 94 resources, 50 hosted D1
  measurement streams with zero errors and p95 398.11 ms against the 1,000 ms
  threshold, 572 freshness references / 60 primary sources, and self-host
  compatibility `0.65.0`.
- `npm run api:check` regenerated Worker types and completed a Wrangler dry run;
  it did not deploy.
- `npm audit --audit-level=moderate` reported zero vulnerabilities.
- `npm pack --ignore-scripts --dry-run --json` produced
  `@project42/platform@0.65.0` with 687 files, 1,956,110 packed bytes and
  9,179,358 unpacked bytes. The archive contains the compatibility manifest,
  D1 migration `0014`, PostgreSQL migration `011`, registration documentation,
  self-host files, and compiled runtime.
- Generator-only training artifacts and generated Worker types produced during
  validation were restored and are intentionally excluded.
- `git diff --check` passed. The scoped added-line review found no private ADO
  URL, credential, personal email address, tenant GUID, secret assignment, or
  private operational value.

## Outstanding release gates

- Protected pull-request CI must rerun the repository verification suite,
  PostgreSQL integration, and self-host smoke gates against the versioned
  candidate.
- The signed `v0.65.0` tag workflow must attest and sign the package and
  compatibility manifest, publish and sign the OCI image, and create the GitHub
  release.
- No push, pull request, tag, GitHub release, OCI publication, production
  migration, Worker deployment, Cloudflare/D1 resource change, Entra change, or
  Azure DevOps mutation belongs to this local preparation task.

AB#5695 and AB#5697 remain Active pending cross-repository and production work.
User Stories are never moved to Closed by automation.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this
repository.

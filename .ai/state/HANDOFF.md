# Handoff

## Active branch

`feat/authoritative-transcripts-ab5176`

Base: `111b52a96416c46d634908ea535e205e394636ca` (`origin/main`)

## Release candidate

The reusable Platform feature release candidate is `0.67.0`. It adds:

- explicit hosted learner-export record types;
- an approved-account, recent-authentication CSV transcript backed by durable
  progress, assessment, and learning-achievement records;
- deterministic ordering, spreadsheet-injection protection, no-store response
  controls, and immutable export audit evidence; and
- an explicit boundary between learning achievements and issued credentials.

The API-owned HttpOnly-cookie session contract and existing JSON, deletion, and
authorization behavior remain unchanged.

## Prepared

- `package.json` and the package-lock root identify `0.67.0`.
- The self-host example selects `PROJECT42_VERSION=0.67.0`.
- The compatibility manifest identifies release, package, and OCI image
  `0.67.0`.
- PostgreSQL migration head remains `012_admin_pagination_indexes.sql`;
  learning-record contract `1.1` and the API-owned HttpOnly-cookie session
  contract v1 remain unchanged.
- README release notes document the authoritative transcript and
  achievement-versus-credential boundary.
- No runtime schema, migration, production configuration, tenant/owner
  identifier, credential, learner data, or private operational value was added
  by release preparation.

## Verification

- `npm ci` passed and reported zero vulnerabilities.
- `npm run check` passed 276 tests: 273 passed, three optional
  live-PostgreSQL tests skipped, and zero failed.
- The full gate validated 12 resource packs / 94 resources, 50 hosted D1
  measurement streams with zero errors and p95 377.4 ms against the 1,000 ms
  threshold, 572 freshness references / 60 primary sources, and self-host
  compatibility `0.67.0`.
- `npm run api:check` regenerated Worker types and completed a Wrangler dry
  run; it did not deploy.
- `npm audit --audit-level=high` reported zero vulnerabilities.
- `npm pack --ignore-scripts --dry-run --json` produced
  `@project42/platform@0.67.0` with 704 files, 1,979,291 packed bytes and
  9,296,859 unpacked bytes.
- Explicit package, lockfile, self-host pin, compatibility release/package/image
  consistency passed.

## Outstanding release gates

- Protected pull-request CI must rerun verification and self-host smoke gates
  against the versioned candidate.
- Independent approval and merge remain required.
- A later signed `v0.67.0` tag workflow must attest and sign the package and
  compatibility manifest, publish and sign the OCI image, and create the GitHub
  release.
- Production deployment and authenticated learner transcript validation remain
  separate release/owner gates.

Do not merge, tag, release, deploy, or move the related stories to Resolved or
Closed from release preparation alone.

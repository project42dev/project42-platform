# Handoff

## Active branch

`chore/platform-v0.64.0-ab5418-ab6358`

## Release candidate

The platform release candidate is `0.64.0`, based on `origin/main` commit
`85aa9eea5057ca0f398ab6ea300f860e44be8e01`.

This is a minor release because main adds public bounded-pagination contracts to
the owner account and audit endpoints. It also includes the executable Keycloak
browser-session lifecycle gate merged immediately afterward.

## Prepared

- `package.json` and `package-lock.json` identify `0.64.0`.
- The self-host example selects `PROJECT42_VERSION=0.64.0`.
- The compatibility manifest identifies release/API/image `0.64.0`.
- The compatibility manifest preserves PostgreSQL migration head
  `010_profile_consent_and_deletion_receipts.sql`, learning-record contract
  `1.1`, and API-owned HttpOnly-cookie session contract v1.
- README release notes describe bounded owner account/audit pagination, cursor
  binding and authorization order, D1/PostgreSQL parity, and the real Keycloak
  authorization-code/PKCE/session lifecycle gate.
- The published package now includes `scripts/`, which the self-host Dockerfile
  requires to build and to run the Keycloak browser-session lifecycle gate from
  an extracted release archive.
- No D1 or PostgreSQL migration is added. Hosted D1 remains at `0013`; the
  self-hosted PostgreSQL head remains `010`.

## Verification

- Feature-main CI run `30430887491` passed at exact source commit
  `85aa9eea5057ca0f398ab6ea300f860e44be8e01`.
- The `verify` job passed with PostgreSQL 17, including account/audit pagination
  parity.
- The `self-host-smoke` job passed Compose, Keycloak provisioning, real Keycloak
  browser authorization, session rotation, sign-out, and teardown.
- `npm ci` completed with zero vulnerabilities.
- `npm run check` passed 250 tests (249 passed, one optional PostgreSQL test
  skipped, zero failed), 12 resource packs / 94 resources, 50 measurement
  streams with p95 419.34 ms, 572 freshness references / 60 primary sources,
  and the `0.64.0` compatibility manifest.
- `npm run api:check` passed Worker type generation and a Wrangler dry run; it
  did not deploy.
- `npm audit --audit-level=moderate` reported zero vulnerabilities.
- `npm pack --ignore-scripts --dry-run --json` produced
  `@project42/platform@0.64.0` with 680 files, 1,942,362 packed bytes and
  9,102,218 unpacked bytes. The archive contains the compatibility manifest,
  owner-pagination documentation and runtime, self-host files, and the
  Keycloak browser-session smoke gate.
- `git diff --check` passed. The scoped added-line and packaged-script scans
  found no private ADO URLs, credentials, personal email addresses, GUID-like
  operational identifiers, or secret/token assignments.
- HCS app-profile validation was invoked; its four checks are review-directed
  placeholders. The corresponding lint/type/test and dependency-audit gates
  were completed by `npm run check` and `npm audit`.

## Outstanding release gates

- Protected pull-request CI must rerun PostgreSQL verification and the
  Compose/Keycloak browser-session lifecycle against the versioned candidate.
- The signed `v0.64.0` tag workflow must attest and sign the package and
  compatibility manifest, publish and sign the OCI image, and create the GitHub
  release.
- No production migration, Worker deployment, Cloudflare/D1 resource change, or
  representative hosted-user validation is part of this release branch.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this repository.

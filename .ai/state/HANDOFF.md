# Handoff

## Active branch

`chore/platform-v0.62.0-ab6231`

## Release candidate

The platform release candidate is `0.62.0`, based on `origin/main` commit
`f19a9307631b6fc3a42d5de499f0769be5c92a79`.

This is a minor release because main adds an additive public account-merge API
contract, required-consent and governance-policy behavior, hosted and self-hosted
configuration, and new D1/PostgreSQL migration heads. A patch release would
understate those new contracts.

## Prepared

- `package.json` and `package-lock.json` identify `0.62.0`.
- The self-host example selects `PROJECT42_VERSION=0.62.0`.
- The compatibility manifest identifies release/API/image `0.62.0` and retains
  PostgreSQL migration head
  `009_account_merge_governance_constraints.sql`.
- README release notes describe the AB#6231 required-consent,
  retention-policy, legal-hold, audit, recovery, and evidence-preservation
  behavior and name D1 migration
  `0012_account_merge_governance_constraints.sql` and PostgreSQL migration
  `009_account_merge_governance_constraints.sql`.
- The release notes also identify the curriculum candidates packaged since
  `0.61.0` without overstating their human-publication status.

## Verification

- `npm ci`: passed; package preparation and TypeScript build passed.
- `npm run check`: passed; 245 tests, 244 passed, one optional PostgreSQL
  integration skipped, zero failures. Resource, recovery-measurement,
  freshness, and self-host validation passed.
- `npm run api:check`: passed Worker type generation and Cloudflare dry-run
  deployment.
- `npm audit --audit-level=moderate`: zero vulnerabilities.
- `npm pack --ignore-scripts --dry-run --json`: package
  `@project42/platform@0.62.0`, 660 files, and both new migration files plus
  the compatibility manifest are present.
- Candidate tag expectation is `v0.62.0`.

## Outstanding release gates

- Docker is not installed in this local environment, so the OCI image build
  cannot be repeated locally. The protected GitHub self-host smoke and signed
  tag workflow must build and validate the image.
- The optional live PostgreSQL integration did not run because no
  `TEST_POSTGRES_URL` was supplied. The release CI/self-host smoke remains the
  required live PostgreSQL gate.
- No branch was pushed, no pull request or tag was created, and no package,
  image, deployment, production service, or ADO work item was changed.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this repository.

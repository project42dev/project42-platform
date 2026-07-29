# Handoff

## Active branch

`feat/admin-pagination-ab6358`

## Scope

AB#6358 adds bounded, deterministic cursor pagination to the reusable platform
backend for:

- `GET /v1/admin/accounts`
- `GET /v1/admin/audit`

No Learn changes, release/version changes, deployment changes, or Azure DevOps
state changes are included.

## Contract

- Default page size: 50.
- Maximum page size: 100.
- Existing `accounts` and `events` response arrays remain at the top level.
- New `page` metadata includes `pageSize`, `returnedCount`, `hasMore`, and
  `nextCursor`.
- Account ordering is `(createdAt ASC, id ASC)` with the existing optional
  `state` filter.
- Audit ordering is the unique database sequence in descending order.
- Cursors are deterministic, opaque traversal state bound to installation,
  query kind, and filter. Format, checksum, cross-query, cross-filter, and
  cross-installation failures return `invalid_admin_cursor`.
- Owner authorization is evaluated before pagination parsing. Cursors are not
  an authorization boundary; approved-owner authorization and tenant-scoped SQL
  remain the security boundaries.
- D1 and the PostgreSQL compatibility adapter execute the same page queries.

## Verification

- Focused D1/API/security/account-merge tests: passed.
- `npm run check`: passed.
  - 249 tests: 248 passed, one optional live-PostgreSQL integration skipped.
  - Hosted D1 measurement: zero errors, p95 464.29 ms against the 1,000 ms
    threshold.
  - Training packages, resources, freshness, recovery measurement, and
    self-host compatibility passed.
- The optional PostgreSQL integration now asserts account and audit pagination
  parity when `TEST_POSTGRES_URL` is available.
- `npm run api:check`: passed Worker type generation and Cloudflare dry run.
- `npm audit --audit-level=moderate`: zero vulnerabilities.
- Package dry run: 667 files; the pagination runtime, declarations, and public
  documentation are present.
- Focused added-line public-information scan: passed.
- Content, examples, schemas, and generated-source paths have no actual diff;
  observed Windows line-ending status noise is not staged.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this
repository.

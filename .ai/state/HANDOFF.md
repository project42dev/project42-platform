# Handoff

## Active branch

`fix/identity-token-diagnostics-ab6437`

Base: `c5cdb8c9a44a70ea0fa1b8f481af97b160cedcf1` (`origin/main`,
signed Platform `v0.67.0` source).

## Release candidate

Platform `0.67.1` is a no-migration identity-observability patch. Browser
ID-token validation still fails closed and returns the same sanitized response,
but server logs can now distinguish:

- nonce mismatch;
- authorized-party mismatch;
- invalid recent-authentication time; and
- JOSE validation failures, including a whitelisted claim name when available.

Diagnostics contain no token, claim value, authorization code, state, cookie,
identity, tenant, application, or secret value.

## Prepared

- `package.json`, the package-lock root, self-host example, and compatibility
  release/package/image values identify `0.67.1`.
- README release notes document the privacy-safe diagnostic boundary.
- Unit coverage asserts exact failure categories for nonce, authorized-party,
  missing `auth_time`, and stale/future `auth_time` cases.
- PostgreSQL migration head remains `012_admin_pagination_indexes.sql`; hosted
  D1 remains unchanged.
- No identity-validation requirement, API response, schema, migration, binding,
  credential, or production configuration changed.

## Verification

- `npm ci --ignore-scripts` passed with zero vulnerabilities.
- `npm run build` passed.
- Focused browser-session, OIDC transport, and identity-security tests passed:
  14 tests, zero failures.
- The complete test suite passed 276 tests: 273 passed, three optional
  live-PostgreSQL tests skipped, and zero failed.
- The release gates validated 12 resource packs / 94 resources, 50 hosted D1
  measurement streams with zero errors and p95 374.04 ms against the 1,000 ms
  threshold, 572 freshness references / 60 primary sources, and self-host
  compatibility `0.67.1`.
- `npm run api:check` regenerated Worker types and completed a Wrangler dry run;
  it did not deploy.
- `npm audit --audit-level=high` reported zero vulnerabilities.
- The package dry run produced `@project42/platform@0.67.1` with 704 files,
  1,983,333 packed bytes, and 9,336,754 unpacked bytes.
- `git diff --check` passed.
- A local `npm run check` stopped at `training:check` because Windows checkout
  line-ending normalization made an existing generated caption appear stale.
  This is not related to the patch; the equivalent build, complete test suite,
  resource, measurement, freshness, compatibility, API, audit, and packaging
  gates all passed. Protected Linux CI must still run the canonical complete
  release gate before merge.

## Outstanding release gates

- Commit and push the candidate with the Project 42 GitHub App.
- Open a protected pull request and require complete Linux CI.
- Complete independent review of diagnostic privacy and validation behavior.
- Merge only after all required checks pass.
- Create and verify the signed `v0.67.1` release on the exact merge commit.
- Update the private production deployment packet to the exact signed release.
- Run mutation-free Preview, deploy the existing Worker without D1 migration,
  and validate health, CORS, account/session boundaries, and OIDC canaries.
- Ask the owner to start one new private-browser login. Use only the fixed
  diagnostic category to identify the failed validator; never retain the token
  or callback credentials.

AB#6437, AB#5418, and AB#6191 remain Active until a real owner session and the
production verified-email claim contract pass.

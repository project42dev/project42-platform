# Handoff

## Active branch

`fix/oidc-expired-token-recovery-ab6437`

Base: `9bbffd791a40ebcd9a154d08050a3e391942dc82`
(`origin/main`).

## Diagnosis

- Private production evidence recorded one `/v1/auth/callback` failure with
  `invalid_identity_token`, `jose_validation`, `ERR_JWT_EXPIRED`, claim `exp`.
- The callback ran on an older Worker deployment. No real callback has reached
  the later `v0.68.1` deployment.
- The provider and Worker clocks differ by approximately 0.53 seconds. This
  does not support relaxing expiration validation.
- The authorization request already requires `prompt=login` and `max_age=0`.
  Microsoft documents a one-hour default ID-token lifetime and the possibility
  of expired ID tokens from stale caches.

## Change

- Expired browser ID tokens remain rejected; no clock tolerance was added.
- The exact `ERR_JWT_EXPIRED`/`exp` callback failure now redirects to the
  normalized learner return target with `auth=error`.
- The consumed OIDC transaction cookie is cleared, no browser session is
  created, and the learner can start a new transaction with a fresh state.
- The recovery log includes only the request identifier, route, recovery
  action, and existing bounded identity-token diagnostic. It never logs the
  token, authorization code, state, nonce, issuer, subject, email, name, return
  target, tenant, application identifier, or secret.
- Browser-session documentation records the fail-closed restart contract.

## Verification

- `npm ci --ignore-scripts` passed with zero vulnerabilities.
- Focused browser/OIDC/identity tests passed.
- The complete suite passed 297 tests: 292 passed, five optional PostgreSQL
  tests skipped, and zero failed.
- Twelve resource packs containing 94 resources validated.
- Fifty hosted D1 measurement streams completed with zero errors and p95
  455.33 ms against the 1,000 ms threshold.
- Freshness checked 572 references against 60 primary sources.
- Self-host compatibility `0.68.1` validated.
- `npm run api:check` regenerated Worker types and completed a Wrangler dry
  run; it did not deploy.
- `npm audit --audit-level=high` reported zero vulnerabilities.
- `git diff --check` passed.
- The local canonical `training:check` remains affected by existing Windows
  generated-caption line-ending normalization. The build-regenerate path and
  all equivalent deterministic gates passed; protected Linux CI must run the
  canonical complete check.

## Remaining gates

- Commit and push through the Project 42 GitHub App.
- Open a protected pull request and require complete Linux CI.
- Merge, prepare a signed release, and deploy through the private operations
  release process.
- Ask the owner to begin one new private-browser sign-in after deployment.
- Query only the new callback's privacy-safe diagnostic and session outcome.
- Keep AB#6437 Active until that real production login succeeds.

# Handoff

## Active branch

`feature/account-lifecycle-controls`

## In progress

- Added the reversible `rejected` account state.
- Added consent history, portable learner export, deletion request/cancellation,
  owner completion, audit redaction, and pseudonymous deletion tombstones.
- Prepared package version `0.46.0`.

## Files changed

- `src/api-contract.ts`
- `src/identity.ts`
- `src/worker.ts`
- `migrations/0004_rejected_state_and_data_rights.sql`
- `tests/d1-migrations.test.mjs`
- `tests/identity-security.test.mjs`
- `README.md`
- `docs/self-hosting/cloudflare-d1.md`
- `docs/self-hosting/identity-providers.md`
- `package.json`
- `package-lock.json`

## Verification

- `npm run check` — passed, 67 tests.
- `npm run api:check` — passed, including Worker dry-run.

## Next steps

1. Commit and push the branch.
2. Open the pull request and confirm CI.
3. Merge and tag `v0.46.0`.
4. Consume the release from Learn and deploy the production Worker/D1 package.

No secrets or production identifiers belong in this repository.

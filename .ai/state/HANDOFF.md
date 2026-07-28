# Handoff

## Active branch

`feat/identity-provisioning-contract-ab6339`

## Current work

AB#6339 implements the public, provider-neutral identity-client provisioning
contract required by hosted and self-hosted Project 42 installers.

## Implemented

- Package candidate `0.53.0`.
- Versioned identity-provisioning plan, durable operation record, provider
  compatibility, adapter, secret-sink, authority-gate, observation, drift, audit,
  rollback, error, and readiness contracts.
- Explicit API, resumable-owner-gate, and preconfigured modes.
- Explicit state-transition policy from planning through validation, rotation,
  recovery, disablement, and terminal retirement.
- Fail-closed validation for PKCE, HTTPS callbacks, exact origins, confidential
  client credentials, least-privilege capabilities, typed authority, secret
  references, monotonic audit evidence, rollback, and errors.
- Forbidden persisted credential fields; raw secret bytes exist only at the
  replaceable in-process secret-sink boundary.
- Machine-readable JSON Schema and valid/invalid API, owner-gate, ready,
  compatibility, and credential-leak fixtures.
- Public self-host documentation, threat controls, installer requirements, and
  release compatibility metadata.

## Files

- `src/identity-provisioning.ts`
- `src/index.ts`
- `schemas/identity/identity-provisioning-contract.schema.json`
- `tests/identity-provisioning.test.mjs`
- `examples/identity-provisioning/`
- `tests/fixtures/identity-provisioning/invalid-credential-leak.json`
- `docs/self-hosting/identity-client-provisioning.md`
- `docs/self-hosting/identity-providers.md`
- `self-host/compatibility.json`
- `self-host/compatibility.schema.json`
- `README.md`
- `package.json`
- `package-lock.json`

## Verification

- `npm run check` — passed: 104 tests, 103 passed and one environment-gated
  PostgreSQL integration skipped; 86 resources; 464 primary-source references;
  self-host compatibility `0.53.0`.
- `npm run api:check` — passed, including Worker type generation and dry run.
- `npm audit --audit-level=moderate` — zero vulnerabilities.
- `npm pack --dry-run --json` — includes the public schema, documentation,
  compatibility metadata, and compiled contract.
- `git diff --check` — passed.

## Next steps

1. Commit, push, review, and merge the contract candidate.
2. Publish and verify signed platform release `v0.53.0`.
3. Record private release evidence and move AB#6339 to its acceptance-ready state
   without closing it.
4. Activate AB#6340 and build the resumable provisioning engine and post-provider
   verification prototype against this contract.

No production tenant, organization, owner, account, client, domain, database,
secret, or learner identifiers belong in this repository.

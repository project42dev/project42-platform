# Handoff

## Active branch

`feat/keycloak-provisioning-adapter-ab6340`

## Current work

AB#6340 now implements the executable Keycloak Admin REST reference adapter
against the released identity-provisioning engine and contract.

## Implemented

- Package candidate `0.55.0`.
- Concrete `KeycloakIdentityProvisioningAdapter` for the current Admin REST API.
- Exact tenant-authority digest, issuer discovery, callback, web-origin,
  post-logout, permission, enabled-state, and credential verification.
- Confidential and browser-public Authorization Code clients with PKCE.
- Immediate generated-secret handoff to the injected secret sink.
- First deployment, idempotent rerun, reconcile/recover, overlapping rotation,
  disablement, and terminal retirement.
- Fail-closed wrong authority, callback drift, provider interruption, ambiguous
  lookup, unsafe permissions, and invalid provider responses.
- Official Keycloak evidence sources and self-host compatibility metadata.

## Files

- `src/keycloak-identity-provisioning-adapter.ts`
- `src/identity-provisioning.ts`
- `src/index.ts`
- `tests/keycloak-identity-provisioning-adapter.test.mjs`
- `tests/identity-provisioning.test.mjs`
- `scripts/smoke-keycloak-provisioning.mjs`
- `.github/workflows/ci.yml`
- `schemas/identity/identity-provisioning-contract.schema.json`
- `docs/self-hosting/identity-client-provisioning.md`
- `self-host/compatibility.json`
- `self-host/compatibility.schema.json`
- `README.md`
- `package.json`
- `package-lock.json`

## Verification

- Targeted contract, adapter, and engine tests: 31 passed.
- Full platform gate: 126 tests, 125 passed, one environment-gated PostgreSQL
  integration skipped, and no failures.
- Worker type generation and Wrangler deployment dry run passed.
- Validated 11 resource packs containing 86 resources.
- Checked 464 references against 40 registered primary sources.
- Self-host compatibility `0.55.0` validated.
- Package dry run contains the Keycloak adapter, engine, public types, schemas,
  documentation, examples, Worker, migrations, and self-host distribution.
- Dependency audit reported zero vulnerabilities.
- Changed Markdown and whitespace gates passed.
- CI now runs real Keycloak create, idempotent rerun, callback drift, reconcile,
  overlapping rotation, disablement, recovery, and retirement against the
  evaluation Compose stack. Local Docker is unavailable; the pull-request
  self-host smoke is the execution gate.

## Next steps

1. Commit, push, review, merge, and publish signed platform release `v0.55.0`.
2. Record private release evidence.
3. Integrate the existing hosted Microsoft Graph and GitHub manifest scripts with
   the common operation record, authority gate, and post-registration verification.
4. Move AB#6340 to its acceptance-ready state without closing it only after that
   real-provider integration is complete.
5. Finish AB#6337 only after hosted and self-host runbook, threat, recovery,
   rotation, upgrade, and retirement evidence is complete.

No production tenant, organization, owner, account, client, domain, database,
secret, or learner identifiers belong in this repository.

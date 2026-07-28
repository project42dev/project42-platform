# Handoff

## Active branch

`feat/identity-provisioning-engine-ab6340`

## Current work

AB#6340 implements the resumable provider-provisioning and post-registration
verification engine against the released identity-provisioning contract.

## Implemented

- Package candidate `0.54.0`.
- `IdentityProvisioningEngine` with API and owner-gated adapter execution.
- Compare-and-set `IdentityProvisioningRecordStore` and serializable in-memory
  reference store.
- Idempotent first deployment and rerun; a new key cannot duplicate a non-retired
  provider client.
- Resumable authority decisions bound to exact role, expiry, and SHA-256
  continuation proof.
- Wrong-role and wrong-proof audit evidence without consuming a valid gate.
- Denied, cancelled, and abandoned/expired gate outcomes without provider writes.
- Retryable adapter/readiness recovery using the same operation and incremented
  durable attempt.
- Post-provider ownership, issuer, callback, permission, credential, and enabled
  observation with fail-closed drift.
- Overlapping secret rotation, adapter-version upgrade reconciliation, disablement,
  and terminal retirement.
- Capability, version, mode, client-kind, state-transition, idempotency-binding,
  stale-write, duplicate-create, and persisted-result rejection.
- Public documentation and self-host compatibility metadata for engine `1.0.0`.

## Files

- `src/identity-provisioning-engine.ts`
- `src/identity-provisioning.ts`
- `src/index.ts`
- `tests/identity-provisioning-engine.test.mjs`
- `docs/self-hosting/identity-client-provisioning.md`
- `self-host/compatibility.json`
- `self-host/compatibility.schema.json`
- `README.md`
- `package.json`
- `package-lock.json`

## Verification

- Targeted engine tests: 11 passed.
- Full platform gate: 115 tests, 114 passed, one environment-gated PostgreSQL
  integration skipped, and no failures.
- Worker type generation and Wrangler deployment dry run passed.
- Validated 11 resource packs containing 86 resources.
- Checked 464 references against 40 registered primary sources.
- Self-host compatibility `0.54.0` validated.
- Package dry run contains the engine, public types, schemas, documentation,
  examples, Worker, migrations, and self-host distribution.
- Dependency audit reported zero vulnerabilities.

## Next steps

1. Commit, push, review, and merge the engine candidate.
2. Publish and verify signed platform release `v0.54.0`.
3. Record private release evidence.
4. Integrate the existing hosted Microsoft Graph and GitHub manifest scripts with
   the common operation record, authority gate, and post-registration verification.
5. Move AB#6340 to its acceptance-ready state without closing it only after that
   real-provider integration is complete.
6. Finish AB#6337 only after hosted and self-host runbook, threat, recovery,
   rotation, upgrade, and retirement evidence is complete.

No production tenant, organization, owner, account, client, domain, database,
secret, or learner identifiers belong in this repository.

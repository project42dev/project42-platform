# Handoff

## Active branch

`fix/account-merge-policy-conflicts-ab6231`

## Current work

AB#6231 duplicate-account reconciliation now extends the merged suspended and
revoked account-state checks with fail-closed required-consent,
retention-policy, and legal-hold controls.

## Implemented

- Account-merge preview returns non-overridable `policyBlocks` for missing,
  withdrawn, or wrong-version required consent on either account.
- A provider-neutral governance-constraint ledger represents active retention
  policies and legal holds without storing raw legal references or personal
  data. Only a SHA-256 external-reference digest is retained.
- Completion captures a fresh snapshot and re-evaluates every policy block
  before the preview digest check. A consent withdrawal or governance
  constraint introduced after preview therefore denies completion and writes
  an auditable `account.merge.complete` denial event.
- D1 migration `0012_account_merge_governance_constraints.sql` and PostgreSQL
  migration `009_account_merge_governance_constraints.sql` enforce
  installation boundaries, immutable evidence, terminal release, and bounded
  actor-reference privacy redaction.
- Released constraints follow the survivor during completion and return to the
  original account during rollback. Existing progress, assessment attempts,
  transcripts, badges, mastery evidence, and merge recovery behavior remain
  covered by the end-to-end fixture.
- Hosted and self-hosted configuration explicitly declares the required
  consent purpose and policy version. Invalid configuration fails closed.

## Verification

- Focused D1 migration replay passes, including authorization, immutability,
  terminal-release, and privacy-deletion behavior.
- Complete `npm run check` gate passes: 245 tests, 244 passed, one optional
  PostgreSQL integration test skipped, zero failures. All 12 resource packs
  containing 94 resources validate; recovery measurement, freshness, and
  self-host compatibility checks pass.
- `npm run api:check` passes Worker type generation and Cloudflare dry-run
  deployment.
- No external service, production deployment, work item, or public repository
  was changed.

## Remaining decision

The data model and merge enforcement are complete, but no routine account
administrator receives authority to create or release retention policies or
legal holds. A separately authorized compliance decision must define:

1. the role or service allowed to create and release those constraints;
2. the required external evidence and audit record;
3. the emergency-release and review procedure.

Until that decision is approved, constraints can be enforced and recovered but
must not be exposed through a general administration endpoint.

No production tenant, organization, owner, account, learner, database, bucket,
credential, recovery, or private operational identifier belongs in this repository.

# Run the Project 42 API on Cloudflare Workers and D1

This repository includes a provider-neutral OIDC API and a Cloudflare D1 reference
adapter. Production resource identifiers and hosted-user data do not belong in this
public repository.

## Local setup

```bash
npm ci
copy .dev.vars.example .dev.vars
npm run db:migrate:local
npm run api:check
npx wrangler dev
```

Replace local identity placeholders in the ignored `.dev.vars` file with a
non-production OIDC tenant. The generic zero UUID in `wrangler.jsonc` is for local
D1 emulation only.

The Worker requires `LEARNING_RECORD_ADAPTER=cloudflare-d1`. Unknown, missing, or
PostgreSQL values fail closed. See the
[hosted learning-record adapter guide](../hosted-learning-record-adapter.md) for
the semantic parity, measurement, capacity, and production metrics gates.

## Database contents

The migrations create tenant-scoped tables for:

- users, editable learner profiles, immutable OIDC identities, roles, and
  account states;
- approval decisions and exact email-domain rules;
- legacy progress snapshots plus authoritative, versioned learning-event streams;
- immutable assessment attempts, answers, scores, and append-only corrections;
- deterministic transcript projections and earned badges;
- idempotent browser-progress imports;
- consent and deletion workflow records;
- proof-bound duplicate-account previews, recovery snapshots, aliases, and
  immutable merge and rollback receipts;
- one-time OIDC authorization transactions and rotating browser sessions stored
  only as token digests;
- pseudonymous deletion tombstones; and
- append-only administrative audit events with narrowly controlled privacy
  redaction during verified deletion.

The Worker exposes learner consent, portable JSON export, and deletion controls
under `/v1/me`. Export and deletion operations require an access token issued
within the previous 15 minutes. Account deletion uses a seven-day cancellation
window and must be completed by an approved owner after the window closes.

Profile fields are available at `/v1/me/profile`. A deployment may bind a private
R2 bucket as `PROFILE_PHOTOS` to enable authenticated JPEG, PNG, and WebP profile
photos. The API validates declared type and file signature, limits uploads to
2 MB, stores only object metadata in D1, returns photos with private no-store
headers, and removes the active object during photo or account deletion. Do not
expose the bucket through a public custom domain.

Owners may create disabled exact-domain rules while automatic approval is
globally locked. Enabling a rule still fails closed until
`DOMAIN_APPROVAL_ENABLED=true` is set after real signed-token verification.
Removal is audited and requires the rule to be disabled first.

Optional GitHub account linkage requires a dedicated GitHub App or OAuth App
configured with the exact Learn callback URL. Set `GITHUB_LINK_CLIENT_ID` and
`GITHUB_LINK_REDIRECT_URI` as deployment configuration and store
`GITHUB_LINK_CLIENT_SECRET` with `wrangler secret put`. The flow requests no
GitHub scopes, uses S256 PKCE and one-time state, fetches the immutable numeric
GitHub user ID, and discards the provider token after verification.

Account merges require recent authentication, two account-bound proofs, an owner
preview, explicit conflict resolution, and an exact confirmation. D1 `batch()`
keeps snapshot capture, reconciliation, aliasing, proof consumption, receipt, and
audit writes atomic. Apply migration `0007_account_merges.sql` before enabling
the owner merge UI. Backup and restore rehearsals must include all
`account_merge_*` tables.

Apply migration `0008_authoritative_learning_events.sql` before accepting
versioned learning commands. The SQL adapter uses one optimistic stream revision
per installation and learner, rejects idempotency-key rebinding, and prevents
updates to committed event rows. Backups and restoration tests must include both
`learning_event_streams` and `learning_events`; a projection can then be rebuilt
from the restored event sequence.

Migration `0009_learning_record_receipts.sql` adds immutable pseudonymous deletion
receipts and restore-specific deletion-replay evidence. Retain deletion receipts
in a protected post-backup ledger so a restore created before a deletion cannot
silently reactivate the deleted learning record.

Migration `0010_secure_browser_sessions.sql` adds one-time authorization
transactions and rotating browser sessions. Apply it before enabling the
API-owned browser sign-in endpoints. See the
[browser-session guide](../browser-sessions.md) for identity-provider,
cookie, secret, CORS, and rollback requirements.

Run migrations against a separately provisioned remote D1 database only after
placing its ID in private deployment configuration. The packaged runner verifies
the ordered Wrangler ledger, binds every applied file to a SHA-256 checksum, and
applies each pending migration with its ledger records as one remote import:

```powershell
npm run db:migrate:remote -- -ConfigurationPath ./wrangler.private.jsonc
```

For a database whose existing `d1_migrations` ledger predates checksum binding,
first verify that the deployed release exactly matches every applied migration.
Then perform the one-time, explicit adoption:

```powershell
npm run db:migrate:remote -- -ConfigurationPath ./wrangler.private.jsonc `
  -AdoptExistingLedger
```

Do not use adoption to conceal missing, reordered, unknown, or modified
migrations. The runner rejects those states. Use `-Plan` for a read-only preview.
Private configuration, resource identifiers, and recovery evidence remain
outside this repository.

## Production controls

- Bind D1 as `PROJECT42_DB`.
- Set `LEARNING_RECORD_ADAPTER=cloudflare-d1` in private deployment
  configuration and verify the adapter contract on `/health`.
- Bind a private R2 bucket as `PROFILE_PHOTOS` when profile-photo support is
  enabled; include that bucket in backup, restore, retention, and deletion
  verification.
- Configure exact frontend origins; never use `*`.
- Store sensitive values with `wrangler secret put` or equivalent secret management.
- Keep the GitHub linkage client secret out of Wrangler variables, logs, exports,
  and browser bundles.
- Set the bootstrap owner by immutable issuer and subject, then protect changes to
  those values as a privileged operation.
- Export, encrypt, and restore-test the database on a documented cadence.
- Preview the checksum-bound remote migration plan, capture a recovery point,
  and require exact release verification before adopting an older ledger.
- Revalidate Cloudflare quotas and pricing before each production release.
- Run the synthetic promotion gate with ephemeral local Miniflare D1 databases;
  they do not consume Cloudflare account database quota.
- Use one separate remote D1 database only for an explicitly authorized,
  quota-checked restoration rehearsal, and delete it after evidence is captured.

See [Identity providers](identity-providers.md) for the portable authentication
contract.

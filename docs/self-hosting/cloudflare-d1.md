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

## Database contents

The migrations create tenant-scoped tables for:

- users, editable learner profiles, immutable OIDC identities, roles, and
  account states;
- approval decisions and exact email-domain rules;
- progress snapshots and normalized module progress;
- assessment attempts and scores;
- transcript projections and earned badges;
- idempotent browser-progress imports;
- consent and deletion workflow records;
- proof-bound duplicate-account previews, recovery snapshots, aliases, and
  immutable merge and rollback receipts;
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

Run migrations against a separately provisioned remote D1 database only after
placing its ID in private deployment configuration:

```bash
npx wrangler d1 migrations apply PROJECT42_DB --remote
```

## Production controls

- Bind D1 as `PROJECT42_DB`.
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
- Revalidate Cloudflare quotas and pricing before each production release.
- Use a separate D1 database for restoration tests.

See [Identity providers](identity-providers.md) for the portable authentication
contract.

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

- users, immutable OIDC identities, roles, and account states;
- approval decisions and exact email-domain rules;
- progress snapshots and normalized module progress;
- assessment attempts and scores;
- transcript projections and earned badges;
- idempotent browser-progress imports;
- consent and deletion workflow records; and
- append-only administrative audit events.

Run migrations against a separately provisioned remote D1 database only after
placing its ID in private deployment configuration:

```bash
npx wrangler d1 migrations apply PROJECT42_DB --remote
```

## Production controls

- Bind D1 as `PROJECT42_DB`.
- Configure exact frontend origins; never use `*`.
- Store sensitive values with `wrangler secret put` or equivalent secret management.
- Set the bootstrap owner by immutable issuer and subject, then protect changes to
  those values as a privileged operation.
- Export, encrypt, and restore-test the database on a documented cadence.
- Revalidate Cloudflare quotas and pricing before each production release.
- Use a separate D1 database for restoration tests.

See [Identity providers](identity-providers.md) for the portable authentication
contract.

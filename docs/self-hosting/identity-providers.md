# Configure an identity provider

Project 42 delegates sign-in to an OpenID Connect (OIDC) provider. It never stores
passwords. The application account is keyed by the token's immutable `iss` (issuer)
and `sub` (subject) claims; email is contact and approval-policy data only.

## Required provider capabilities

Use a provider that supports:

- OIDC Authorization Code flow with PKCE for the browser client;
- signed JWT access tokens for the Project 42 API;
- a stable subject for the lifetime of an account;
- an issuer, API audience, and HTTPS JSON Web Key Set (JWKS) endpoint;
- short-lived access tokens; and
- a trustworthy boolean claim indicating whether the primary email was verified.

Do not configure implicit flow, password grant, client secrets in the browser, or
email as the account identifier.

## API configuration

The Worker reads the following non-secret values:

| Variable | Purpose |
|---|---|
| `OIDC_ISSUER` | Exact accepted `iss` claim |
| `OIDC_AUDIENCE` | Exact API audience |
| `OIDC_JWKS_URL` | HTTPS signing-key endpoint |
| `OIDC_EMAIL_CLAIM` | Claim containing the primary email |
| `OIDC_EMAIL_VERIFIED_CLAIM` | Boolean verification claim |
| `INSTALLATION_ID` | Stable identifier that scopes every record |
| `ALLOWED_ORIGINS` | Comma-separated exact frontend origins |
| `BOOTSTRAP_OWNER_ISSUER` | First owner's immutable issuer |
| `BOOTSTRAP_OWNER_SUBJECT` | First owner's immutable subject |
| `GITHUB_LINK_CLIENT_ID` | Optional GitHub App or OAuth App client ID for account linkage |
| `GITHUB_LINK_REDIRECT_URI` | Exact Learn callback URL; its origin must be allowed |

The public `wrangler.jsonc` and `.dev.vars.example` contain local placeholders.
Keep real resource IDs in private deployment inventory and secrets in the platform
secret manager. Store `GITHUB_LINK_CLIENT_SECRET` only as a Worker or platform
secret.

## Browser configuration

The Learn client needs only public OIDC metadata:

- authority/issuer;
- client ID;
- API audience and scope;
- API origin; and
- the exact Learn redirect and post-logout URLs.

The client registration is public and uses PKCE. Do not create or embed a client
secret.

## Provider notes

### Microsoft Entra External ID

Create an external tenant and separate public browser/API registrations. Configure
the browser registration for Authorization Code with PKCE, expose an API scope, and
map a verified-email claim appropriate to the selected user flow. Use the tenant's
exact issuer; do not accept common or multi-tenant issuer aliases.

### Keycloak

Create a realm, a public client for Learn, and a separate API audience/client.
Disable direct-access grants, require PKCE, and verify that the access token includes
the intended audience and a stable subject.

The reference Compose `test` profile runs a real Keycloak authorization-code
journey through the Project 42 callback. It creates an ephemeral verified test
identity, proves S256 PKCE and nonce validation, resolves the server-side session,
rotates it, signs out, and removes the provider identity. The test container uses
only the private Compose network. It does not relax the product requirement that
browser-session authorization, token, callback, and logout endpoints use HTTPS.

### Authentik

Create an OAuth2/OpenID provider and public application, require PKCE, and configure
the API audience and email-verification property mapping. Keep signing-key rotation
and the published JWKS endpoint enabled.

### Okta or Auth0

Create a single-page/public application and a custom authorization server or API
audience. Require Authorization Code with PKCE. Confirm the access token—not only
the ID token—contains the API audience and configured email-verification claim.

Other conforming OIDC providers work when they satisfy the same contract. Provider
names are examples, not hard-coded adapters.

## Deployment-time client provisioning

Use the versioned
[identity-client provisioning contract](identity-client-provisioning.md) to create,
validate, rotate, recover, disable, and retire provider clients. It distinguishes
supported backend APIs from resumable owner/admin gates and validated
preconfiguration. Learners and routine Project 42 account administrators never
register infrastructure identity applications.

## Linked identities

The learner account is stable even when it has more than one verified external
identity. Each identity records a provider-neutral provider ID, immutable issuer
and subject, optional provider display metadata, verification timestamps, and
whether it is the account's primary sign-in identity. Provider access tokens and
refresh tokens are never stored.

Self-service linking uses a short-lived, single-use transaction bound to the
authenticated learner, an opaque state digest, an S256 PKCE challenge, and a local
return path. A provider adapter must independently complete its authorization
flow, retrieve the provider's immutable subject, and pass only the freshly
verified identity attributes to the account service. An identity already linked
to another learner is rejected; it is never used to silently combine accounts.

The built-in GitHub adapter supports a dedicated GitHub App or OAuth App web
authorization flow. It requests no GitHub scopes, exchanges the code server-side,
calls `/user` for the immutable numeric account ID, and immediately discards the
provider token. The client secret never belongs in a browser bundle, learner
record, export, or audit event.

Learners may unlink a non-primary identity after recent authentication. The
primary identity and the last usable identity cannot be removed through this
operation. Account merge, primary-identity replacement, and owner recovery are
separate audited workflows and must preserve progress, attempts, transcripts,
badges, consent, deletion state, and attribution evidence.

## Duplicate-account recovery and merge

Account merge never uses matching email addresses as proof. Each account must
provide either a one-time proof created from a recent authenticated session or a
governed owner-recovery proof based on at least two independent, non-email
verification methods. Proofs expire after 15 minutes, are stored only as SHA-256
digests, and are consumed by one merge.

An approved owner creates a 30-minute preview before completing a merge. The
preview identifies the source account, the survivor, proof methods, record
counts, and every profile or owner-role conflict. Completion requires:

- the exact source-to-survivor confirmation;
- the preview's idempotency key;
- an explicit `source` or `survivor` choice for every conflict;
- current grants for every consent configured in
  `ACCOUNT_MERGE_REQUIRED_CONSENTS`;
- no active retention-policy or legal-hold merge constraint;
- unchanged account data since preview; and
- both one-time proofs to remain unused and unexpired.

The preview returns `policyBlocks` separately from source-versus-survivor
conflicts. A policy block cannot be overridden by choosing an account. Missing,
withdrawn, or wrong-version required consent and active retention or legal-hold
constraints deny completion. The service checks live data again at completion,
records a denied audit event, and therefore also stops a constraint introduced
after preview.

Migration `0012_account_merge_governance_constraints.sql` for D1 and
`009_account_merge_governance_constraints.sql` for PostgreSQL add the
provider-neutral constraint ledger. `policy_key` and `policy_version` are
non-sensitive policy identifiers. `reference_digest` is a SHA-256 digest of the
external authority reference; never store a case narrative, personal data, or a
raw legal reference in this table. Constraint evidence cannot be rebound, and a
release is terminal. Creation and release belong to the deployment's separately
approved compliance workflow; the account API does not grant that authority to
routine account administrators.

Completion writes the recovery snapshot, reconciliation changes, source identity
alias, consumed-proof state, immutable receipt, and audit event in one database
transaction. The service preserves both accounts' progress, module state,
assessment attempts, transcript projections, badges, progress-import history,
consent, and completed deletion history. Colliding attempt or import identifiers
are deterministically remapped rather than discarded.

The source identity continues to resolve to the survivor without moving or
reissuing the provider identity. A rollback restores the pre-merge records only
when no learner record, profile, consent, identity link, or deletion activity
occurred after completion. Otherwise the service refuses destructive rollback
and requires a reviewed recovery plan. Completed deletion removes the survivor,
all merged source identities, recovery snapshots, and proof evidence while
retaining only pseudonymous identity tombstones and non-personal receipt
digests.

The account service exposes:

| Method and route | Purpose |
|---|---|
| `POST /v1/me/account-merge-proof` | Create a recent-session proof for the signed-in account |
| `POST /v1/admin/account-merges/recovery-proofs` | Record a two-method owner-assisted recovery proof |
| `POST /v1/admin/account-merges/preview` | Create an idempotent, proof-bound preview |
| `GET /v1/admin/account-merges/{id}` | Review conflicts, evidence classes, and record counts |
| `POST /v1/admin/account-merges/{id}/complete` | Reconcile records and create the immutable receipt |
| `GET /v1/admin/account-merges/{id}/receipt` | Retrieve receipt and snapshot digests |
| `POST /v1/admin/account-merges/{id}/rollback` | Restore the snapshot when no later activity exists |

The learner-data export includes active and previously unlinked identity history
without exposing issuer or subject values. Account deletion removes active
identity records and retains only digested identity tombstones required to prevent
accidental reattachment after a completed deletion.

## Approval behavior

New identities are `pending` unless either:

1. their immutable issuer and subject match the configured bootstrap owner; or
2. their provider-verified email domain exactly equals an enabled owner-managed rule.

Rules never use suffixes or wildcards. A rule for `example.com` does not approve
`sub.example.com`, `example.com.attacker.test`, or an unverified email.

Owners may move accounts through these transitions:

```text
pending -> approved -> suspended -> approved
   |          |             |
   |          +-------------+-> revoked
   |
   +-> rejected -> approved
          |
          +--------------------> revoked
```

Use `rejected` for a registration decision that an owner may reconsider. Use
`revoked` for a terminal security or policy decision. Every state and
domain-policy change is audited.

OIDC callback success is not itself learner authorization. Pending and rejected
accounts receive only a 30-day opaque registration-status receipt; approved
accounts receive the API-owned learner session. The status receipt is
installation-scoped, contains no identity data, and cannot call learner or
owner routes. Approval requires a new sign-in before a learner session is
issued. Live account state is rechecked on session creation, renewal, and use.
Concurrent owner decisions use compare-and-set semantics and the losing stale
decision returns a conflict without a second decision or audit record.

## Validation checklist

Before production:

1. Test valid, expired, wrong-issuer, wrong-audience, and unknown-key tokens.
2. Confirm the browser uses PKCE and stores no client secret.
3. Confirm pending, rejected, suspended, and revoked accounts cannot read or write
   progress.
4. Confirm only approved owners can manage accounts and domains.
5. Test exact-domain rules with subdomain and look-alike negative cases.
6. Rotate the signing key and verify JWKS refresh.
7. Export and restore the database into an isolated environment.
8. Confirm export and deletion require authentication issued within 15 minutes.
9. Confirm deletion observes the cancellation window, removes active learner data,
   redacts retained audit identity fields, and leaves only a pseudonymous tombstone.
10. Confirm link state and PKCE values expire, cannot be replayed, and are bound to
    the learner who created them.
11. Confirm the same external identity cannot be linked to two learner accounts.
12. Confirm unlink cannot remove the primary or last usable identity and that
    export and deletion cover linked-identity history.
13. Confirm account merge rejects email-only, wrong-account, expired, consumed,
    and replayed proofs.
14. Confirm every merge conflict requires an explicit choice and a stale preview
    cannot complete.
15. Confirm retry returns the original receipt, receipt rows are immutable,
    rollback refuses post-merge activity, and merged-account deletion removes all
    source identities and recovery snapshots.
16. Confirm pending and rejected callbacks create no learner session and expose
    only a PII-free registration status.
17. Confirm a registration receipt cannot cross installations or authorize any
    `/v1/me` or `/v1/admin` route.
18. Confirm pre-boundary sessions for non-approved accounts are revoked on use
    and simultaneous owner decisions commit exactly one transition.

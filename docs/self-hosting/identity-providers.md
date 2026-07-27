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

The public `wrangler.jsonc` and `.dev.vars.example` contain local placeholders.
Keep real resource IDs in private deployment inventory and secrets in the platform
secret manager.

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

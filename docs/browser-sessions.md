# Secure browser sessions

Project 42 browser applications use an API-owned OpenID Connect Authorization
Code flow with PKCE. Browser code receives only an opaque, host-only session
cookie; it does not store provider access or ID tokens.

## Identity-provider registration

Register a web client with exactly one API callback:

```text
https://<api-host>/v1/auth/callback
```

Enable Authorization Code, require PKCE with `S256`, and disable password and
implicit grants. The provider must issue signed ID tokens with `iss`, `sub`,
`aud`, `exp`, `iat`, `auth_time`, and `nonce`. A token with multiple audiences
must identify the configured client in `azp`.

Trusted-domain approval also requires a non-empty email claim and a separate
email-verification claim whose JSON value is the Boolean `true`. Email presence,
provider documentation, an authentication-method claim, and the string
`"true"` are not substitutes for that signed Boolean assertion. Keep domain
approval disabled until a real signed token from every enabled sign-in method
has proved this contract.

Configure these non-secret values:

```text
OIDC_AUTHORIZATION_ENDPOINT
OIDC_TOKEN_ENDPOINT
OIDC_CLIENT_ID
OIDC_REDIRECT_URI
OIDC_LOGOUT_ENDPOINT
ALLOWED_ORIGINS
```

Store `OIDC_CLIENT_SECRET`, when the provider requires one, and
`SESSION_ENCRYPTION_KEY` in the deployment secret manager. The session key is
a base64url-encoded 32-byte value. Never place either value in repository
configuration or a browser bundle.

## Routes

- `GET /v1/auth/start?return_to=<allowed-url>` creates an encrypted, ten-minute
  state/nonce/PKCE transaction and redirects to the provider.
- `GET /v1/auth/callback` consumes the transaction once, verifies the ID token,
  creates the account when needed, and issues a learner browser cookie only
  when the account is approved.
- `GET /v1/registration/status` accepts only the opaque registration-receipt
  cookie and returns a PII-free pending or owner-contact status.
- `GET /v1/auth/session` returns the current account and bounded session expiry
  for approved accounts. Non-approved bearer clients receive only the account
  state, without an account ID or identity fields.
- `POST /v1/auth/renew` rotates the opaque identifier atomically.
- `POST /v1/auth/signout` revokes the session and clears even an expired or
  unknown cookie.

Browser fetches must use `credentials: "include"`. Cookie-authenticated
mutations require an exact configured `Origin`; wildcard CORS is unsupported.
Bearer clients remain available for non-browser integrations and do not use
the cookie endpoints.

Pending and rejected accounts receive a separate
`__Host-project42_registration` capability rather than a learner session. The
384-bit receipt is valid for at most 30 days, only its SHA-256 digest is stored,
and it is scoped to the installation that created it. It cannot authorize
profile, progress, transcript, export, deletion, or owner routes. After an
owner decision, every outstanding receipt is revoked. The learner starts a new
sign-in transaction; an approved callback creates the learner session, while a
rejected callback may issue a new PII-free status receipt. Repeating sign-in
while pending or rejected atomically replaces the prior receipt, and a replaced,
expired, replayed-after-invalidation, or cross-installation receipt fails closed
and is cleared. A copied active receipt can disclose only the same PII-free
status and cannot authorize account or learner data. Suspended and revoked
accounts receive neither capability.

Direct bearer clients also recheck the live database state before every
`/v1/me` request. Pending, rejected, suspended, and revoked accounts may read
only their opaque account state. The explicit exceptions are recently
authenticated access to consent history and withdrawal, private learner-data
export, and account-deletion review, request, or cancellation. These narrow
data-rights routes do not grant learner-record access; consent grants, profiles,
photos, linked identities, progress, merge proofs, and every unknown future
`/v1/me` route require an approved account.

The callback consumes its transaction before handling a provider denial or
exchanging the authorization code. This fail-closed ordering prevents replay;
a provider error or transient exchange failure requires the learner to start a
new sign-in transaction. A provider ID token expired beyond the bounded
tolerance also remains rejected. Browser ID-token verification permits only
60 seconds of clock skew, and only
when both nonce validation and fresh `auth_time` evidence are required. Tokens
outside that bound remain rejected. Direct bearer-token validation receives no
clock-skew tolerance.
The callback clears its transaction cookie and redirects to the normalized
learner return target with the generic `auth=error` state so the learner can
start a fresh transaction instead of remaining on an API error response.
Server diagnostics record only the bounded JOSE category, code, claim name, and
coarsened timing metadata; they never include the token, authorization code,
state, nonce, identity claims, or return target.

After a signed ID token passes issuer, audience, expiry, nonce, authorized-party,
and recent-authentication validation, the server records one low-cardinality
`oidc.identity.claim_contract` diagnostic. It classifies the email claim as
`missing`, `present`, or `invalid_type` and the verification claim as `missing`,
`invalid_type`, `unverified`, or `verified`. The record includes the server
request ID but no token, email, subject, issuer, tenant, application identifier,
claim value, authorization code, state, nonce, or return target. This is the
evidence surface for accepting a deployment's verified-email contract without
retaining identity data in operational logs.

Both unauthenticated routes are protected before transaction creation, cookie
parsing, or provider exchange. Hosted Workers require the
`AUTH_CLIENT_RATE_LIMITER` and `AUTH_INSTALLATION_RATE_LIMITER` bindings and a
trusted `CF-Connecting-IP` value. The default policy admits at most ten requests
per client and one hundred per installation for each route in a 60-second
window. Limiter keys contain only SHA-256 digests, not raw network addresses or
deployment identifiers. Missing client evidence, missing bindings, and limiter
errors return a generic `503`; exhausted limits return `429` with
`Retry-After`.

Self-hosted runtimes use the provider-neutral `AuthAbuseLimiter` contract. The
PostgreSQL implementation takes transaction-scoped advisory locks and counts
digest-only attempt evidence in the existing audit ledger, so concurrent
processes enforce the same client and installation caps without a process-local
counter. Repeated denials are coalesced into at most one marker per installation,
route, and limiter window so hostile traffic cannot cause unbounded audit-ledger
growth. A trusted HTTP adapter must supply the peer address rather than accept an
untrusted forwarding header.

## Security and operations

Transaction and registration-receipt cookies use the `__Host-` prefix; the
session cookie uses `__Secure-` so it can optionally carry a `Domain`
attribute (`__Host-` forbids one entirely per RFC 6265bis). All three are
`Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax`. By default the session
cookie is still host-only, matching a single-origin deployment. Setting the
`SESSION_COOKIE_DOMAIN` Worker variable to a leading-dot registrable domain
(for example `.project-42.dev`) scopes the session cookie to every subdomain
of that domain from one sign-in, without a second identity client — the
Worker still authorizes every request independently of which subdomain
presented the cookie. Session tokens are random and only their SHA-256
digests are stored. Rotation, revocation, and account-state
changes are committed with append-only audit evidence. Suspension, revocation,
merge, and merge rollback revoke affected sessions and require a fresh sign-in.
Session creation and renewal recheck the live database state. A session created
before this boundary for a pending, rejected, suspended, or revoked account is
revoked and audited on its next use. Owner decisions use an expected state and
revision plus a database-bound transition marker, so two concurrent stale
decisions cannot both commit or create contradictory audit evidence.

Apply D1 migrations through `0015_admin_pagination_indexes.sql` or PostgreSQL
migrations through `012_admin_pagination_indexes.sql`. Backups include the
authorization, session, and digest-only registration-request tables, but
restored active sessions should be revoked at the recovery boundary. Retired
and expired session and receipt rows are retained briefly for audit correlation
and then cleaned without retaining raw cookie values.

Before promotion, verify state and callback replay rejection, nonce, issuer,
audience, `azp`, and `auth_time`, hostile and missing origins, rotation races,
invalid-cookie recovery, abuse-limit exhaustion and recovery, limiter outages,
suspension/revocation, account merges, and rollback. PostgreSQL rotation checks
and audit insertion execute before commit; a failed audit or stale concurrent
rotation rolls back the replacement row.
Also verify pending and rejected callbacks never create learner sessions,
registration receipts cannot cross installations or disclose identity fields,
receipt replacement and every account-state transition invalidate prior
capabilities, every protected bearer route fails closed without side effects
for all non-approved states, pre-boundary stale sessions are revoked, and
concurrent owner decisions produce exactly one transition and one audit event.
Rotate `SESSION_ENCRYPTION_KEY` through a reviewed deployment because active
authorization transactions encrypted with the old key become invalid.

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
  creates the account when needed, and issues the browser cookie.
- `GET /v1/auth/session` returns the current account and bounded session expiry.
- `POST /v1/auth/renew` rotates the opaque identifier atomically.
- `POST /v1/auth/signout` revokes the session and clears even an expired or
  unknown cookie.

Browser fetches must use `credentials: "include"`. Cookie-authenticated
mutations require an exact configured `Origin`; wildcard CORS is unsupported.
Bearer clients remain available for non-browser integrations and do not use
the cookie endpoints.

The callback consumes its transaction before handling a provider denial or
exchanging the authorization code. This fail-closed ordering prevents replay;
a provider error or transient exchange failure requires the learner to start a
new sign-in transaction.

## Security and operations

Transaction cookies and session cookies use the `__Host-` prefix, `Secure`,
`HttpOnly`, `Path=/`, and `SameSite=Lax`. Session tokens are random and only
their SHA-256 digests are stored. Rotation, revocation, and account-state
changes are committed with append-only audit evidence. Suspension, revocation,
merge, and merge rollback revoke affected sessions and require a fresh sign-in.

Apply D1 migration `0010_secure_browser_sessions.sql` or PostgreSQL migration
`007_secure_browser_sessions.sql`. Backups include both session tables, but
restored active sessions should be revoked at the recovery boundary. Retired
and expired session rows are retained briefly for audit correlation and then
cleaned without retaining the raw cookie value.

Before promotion, verify state and callback replay rejection, nonce, issuer,
audience, `azp`, and `auth_time`, hostile and missing origins, rotation races,
invalid-cookie recovery, suspension/revocation, account merges, and rollback.
Rotate `SESSION_ENCRYPTION_KEY` through a reviewed deployment because active
authorization transactions encrypted with the old key become invalid.

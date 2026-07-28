# Docker Compose evaluation deployment

Project 42 publishes a local evaluation profile for the account API, PostgreSQL
database, and reference OpenID Connect provider. It is intended for a private
workstation or isolated lab. It is not the production profile: Keycloak runs in
development mode and the browser-facing endpoints use HTTP on `localhost`.

## Prerequisites

- Docker Engine 27 or newer with Docker Compose v2
- Git
- 4 GB of available memory
- ports 8080 and 8787 available on `localhost`

## Start the services

From the repository root:

```bash
cp self-host/.env.example self-host/.env
```

Replace both example passwords in `.env` with different random values of at
least 24 characters. Keep that file out of source control.

```bash
docker compose --env-file self-host/.env -f self-host/compose.yaml config --quiet
docker compose --env-file self-host/.env -f self-host/compose.yaml up --build --detach --wait
curl --fail http://localhost:8787/health
```

The services are:

| Service | Local address | Purpose |
| --- | --- | --- |
| Account API | `http://localhost:8787` | Accounts, authorization, progress, transcripts, badges, privacy, and audit |
| Keycloak | `http://localhost:8080` | Replaceable reference OIDC provider |
| PostgreSQL | internal only | Durable learner and administrative records |
| Profile-photo volume | internal only | Private account photos through the replaceable filesystem storage adapter |

The API applies checksum-locked PostgreSQL migrations under an advisory lock
before accepting traffic. A changed migration that has already been applied
causes startup to fail instead of silently changing the database.
Migration `005_learning_events.sql` adds the same immutable event store and
optimistic learner-stream revisions used by hosted D1. The release gate runs the
public learning-event conformance harness against PostgreSQL 17.
Migration `006_learning_record_receipts.sql` adds immutable, pseudonymous deletion
receipts and deletion-replay evidence. Back up the post-backup deletion-receipt
ledger separately and import/replay it before promoting a restored service.
Migration `007_secure_browser_sessions.sql` adds the portable session schema and
its tenant, chronology, lifecycle, and immutability guards. A production
self-hosted deployment must configure HTTPS OIDC browser endpoints and its own
persistent session-encryption secret before enabling API-owned browser sessions.

Migration `008_authoritative_progress_imports.sql` adds schema-versioned
`progress.imported` events. The API reads progress from the rebuilt event
projection while retaining the older relational progress tables as compatibility
read models for current exports and merge workflows.
The identity readiness probe follows the
[official Keycloak health-check guidance](https://www.keycloak.org/observability/health)
for its internal management port (verified 2026-07-27).

This repository does not assign a default owner. After a user signs in, use a
reviewed bootstrap-owner issuer and subject for the first owner or approve the
account through an existing owner. Never use an email address as the immutable
owner key.

The reference API stores profile photos in the named
`project42_profile_photos` volume. Files use random internal keys, are never
served directly by the container, and are returned only through authenticated
API requests. Set `PROFILE_PHOTO_DIRECTORY` to a writable private mount when
building another self-hosted profile; do not place photos in a public static
asset directory.

## Identity modes and Learn compatibility

The default HTTP evaluation profile is deliberately **bearer-only**. It can
exercise signed access-token validation, including the recent `auth_time`
evidence required by sensitive account routes, but it cannot issue the
`Secure` API-owned browser-session cookie. `BROWSER_SESSION_MODE=disabled`
fails closed if a browser-session endpoint is called.

Learn 0.9.0 is the coordinated candidate implementing the API-owned HTTP-only
cookie contract, but it has not been published. The machine-readable
compatibility manifest therefore marks 0.9.0 as `candidate`, not `released`,
and does not claim that the older browser-side OIDC client is compatible. The
candidate needs only this public runtime value:

```text
NEXT_PUBLIC_PROJECT42_API_ORIGIN=https://api.example.org
```

Learn must send same-site API requests with credentials included and initiate
sign-in through `/v1/auth/start`; it must not store access or refresh tokens.

### Enable API-owned browser sessions behind HTTPS

Do not disable `Secure` cookies or relax the HTTPS checks for local testing.
Instead, put the API, Learn, and identity provider behind a trusted local or
external HTTPS reverse proxy, register the exact API callback, and set:

```text
PROJECT42_PUBLIC_URL=https://api.example.org
PROJECT42_ALLOWED_ORIGINS=https://learn.example.org
PROJECT42_OIDC_ISSUER=https://identity.example.org/realms/project42
PROJECT42_OIDC_JWKS_URL=https://identity.example.org/realms/project42/protocol/openid-connect/certs
PROJECT42_BROWSER_SESSION_MODE=oidc
PROJECT42_OIDC_AUTHORIZATION_ENDPOINT=https://identity.example.org/realms/project42/protocol/openid-connect/auth
PROJECT42_OIDC_TOKEN_ENDPOINT=https://identity.example.org/realms/project42/protocol/openid-connect/token
PROJECT42_OIDC_CLIENT_ID=project42-api-browser
PROJECT42_OIDC_CLIENT_SECRET=
PROJECT42_OIDC_REDIRECT_URI=https://api.example.org/v1/auth/callback
PROJECT42_OIDC_LOGOUT_ENDPOINT=https://identity.example.org/realms/project42/protocol/openid-connect/logout
PROJECT42_SESSION_ENCRYPTION_KEY=<base64url-encoded-32-byte-random-key>
```

The reference realm includes a public PKCE browser client with an exact
`https://localhost:8787/v1/auth/callback` demonstration redirect. Replace that
registration with the deployment's exact HTTPS API origin; do not add a
wildcard. A production operator may instead provision a confidential client
and place its secret in the deployment's secret manager.

Keycloak 26.7 full access tokens include `auth_time`; both reference clients
explicitly disable lightweight access tokens so bearer authorization retains
that claim. Project 42 sends `prompt=login` and `max_age=0`, validates a fresh
`auth_time`, and binds the ID token to the authorization transaction's
`nonce`. The release tests verify those request and claim contracts. Validate
the same behavior with a real token from any replacement provider before
promotion.

## Back up and restore

Create an encrypted or access-controlled backup outside the repository:

```bash
docker compose --env-file self-host/.env -f self-host/compose.yaml exec -T database \
  pg_dump --format=custom --no-owner --username=project42 project42 \
  > project42.backup
```

Test restoration in an isolated empty database:

```bash
docker compose --env-file self-host/.env -f self-host/compose.yaml exec -T database \
  createdb --username=project42 project42_restore_test
docker compose --env-file self-host/.env -f self-host/compose.yaml exec -T database \
  pg_restore --exit-on-error --no-owner --username=project42 \
  --dbname=project42_restore_test < project42.backup
```

Delete the restore-test database after validation:

```bash
docker compose --env-file self-host/.env -f self-host/compose.yaml exec -T database \
  dropdb --username=project42 project42_restore_test
```

Backups contain learner and identity-adjacent records. Encrypt them, restrict
access, document retention, and replay completed deletion tombstones after any
production restore.

The database backup contains profile-photo metadata but not the photo bytes.
Back up and restore the `project42_profile_photos` volume as a coordinated,
encrypted artifact, and validate both together in the isolated restoration
test. A database-only restore may contain photo metadata whose object no longer
exists; the API fails closed rather than substituting another object.

## Stop or reset

Stop without deleting persistent data:

```bash
docker compose --env-file self-host/.env -f self-host/compose.yaml down
```

The following evaluation-only reset permanently removes its database and
reference-identity volumes:

```bash
docker compose --env-file self-host/.env -f self-host/compose.yaml down --volumes
```

## Production boundary

A production deployment must use HTTPS for every browser-facing origin, a
production OIDC service and database configuration, managed secrets, tested
backup and restore, monitoring, and an approved first-owner process. The API
rejects insecure HTTP URLs in `NODE_ENV=production`; setting the evaluation
flag cannot override that rule.

## Verify a release

Download the release archive, compatibility manifest, and their
`*.sigstore.json` bundles from the matching GitHub release. Verify the signed
artifacts before extracting or approving an update:

```bash
cosign verify-blob \
  --bundle project42-platform.sigstore.json \
  --certificate-identity-regexp '^https://github.com/project42dev/project42-platform/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  project42-platform-v0.60.0.tgz
cosign verify-blob \
  --bundle compatibility.sigstore.json \
  --certificate-identity-regexp '^https://github.com/project42dev/project42-platform/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  compatibility.json
```

The release workflow also publishes GitHub artifact attestations and signs the
digest-addressed OCI image. Review `compatibility.json` before approving an
update; `automaticApply` is deliberately `false`.

See [Identity providers](identity-providers.md) for the adapter contract and
[learner data policy](../learner-data-policy.md) for retention, deletion, and
recovery controls.

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

`--wait` gates on the API's explicit `GET /health` probe as well as the
PostgreSQL and Keycloak readiness checks. The API cannot report healthy until
its checksum-locked migrations and profile-photo storage initialization have
completed and the HTTP listener is serving the public health contract.

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
Migration `011_registration_boundary.sql` adds digest-only registration status
receipts and atomic expected-state owner decisions. Apply it before accepting
new registrations so pending or rejected identities cannot receive learner
sessions.
Migration `012_admin_pagination_indexes.sql` adds the complete tenant-scoped
account and audit keyset indexes used by bounded owner administration queries.
Apply it before validating large account or audit traversals.
The required PostgreSQL release gate also creates, reads, and updates a learner
profile and exports that learner's complete data package. This catches
adapter-specific timestamp projection failures that migration-only checks cannot
detect.

Migration `013_account_notification_outbox.sql` adds the provider-neutral
account notification outbox and its delivery-state guards. The reference
container intentionally uses disabled delivery and requires no messaging
credential. A self-hoster must review and supply a backend
`AccountNotificationAdapter` before dispatch can claim queued work. Set
`PROJECT42_ACCOUNT_NOTIFICATION_ADAPTER_MODULE` to an installed package name or
to the absolute container path of a reviewed module mounted read-only by a
Compose override. That module must export
`createAccountNotificationAdapter()`. It receives an abort signal and absolute
deadline for every delivery; it must use the opaque notification ID for
downstream idempotency. Keep the variable empty to preserve fail-closed
delivery. See
[Account notification outbox](../account-notifications.md).

Migration `008_authoritative_progress_imports.sql` adds schema-versioned
`progress.imported` events. The API reads progress from the rebuilt event
projection while retaining the older relational progress tables as compatibility
read models for current exports and merge workflows.
The identity readiness probe follows the
[official Keycloak health-check guidance](https://www.keycloak.org/observability/health)
for its internal management port (verified 2026-07-27).

This repository does not assign a default owner. Provision the first identity
before starting the API, retrieve the subject that the identity provider
actually issued, and set that reviewed issuer/subject pair as the bootstrap
owner. Do not invent a subject or use an email address as the immutable owner
key. The secure release test below demonstrates that ordering with Keycloak.

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

Learn 0.11.0 is the coordinated released client implementing the API-owned
HTTP-only cookie contract. It needs only this public build-time value:

```text
NEXT_PUBLIC_PROJECT42_API_ORIGIN=https://api.example.org
```

Learn must send same-site API requests with credentials included and initiate
sign-in through `/v1/auth/start`; it must not store access or refresh tokens.

### Enable API-owned browser sessions behind HTTPS

Do not disable `Secure` cookies or relax the HTTPS checks for local testing.
The supported local HTTPS topology puts the API, Learn, and identity provider
behind Caddy's persistent internal certificate authority. It exposes only TCP
443 to the host; PostgreSQL, Keycloak, Learn, and the API remain private on the
Compose network.

Copy and edit the secure example:

```bash
cp self-host/env.https.example self-host/.env.https
```

Generate independent random values for the database and Keycloak administrator
passwords. Generate the session key without writing it to shell history:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Set that output as `PROJECT42_SESSION_ENCRYPTION_KEY`, replace the stable
installation ID, and preserve the release-pinned Learn source commit unless the
compatibility manifest for a later Platform release names another compatible
Learn version. Then validate and start the topology:

```bash
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml config --quiet
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml up --build --detach --wait
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  --profile test run --rm secure-topology-smoke
```

Release acceptance goes beyond endpoint reachability. On a fresh disposable
test installation, start the identity prerequisites, create a verified Keycloak
identity, capture Keycloak's issued subject, and only then start the API with
that subject as the bootstrap owner. A real headless Chromium browser
then drives Learn through Keycloak, the API callback, and the authenticated
account surface. Chromium trusts the generated public Caddy root through its
private NSS trust database; TLS verification is never disabled. The verifier
runs as the unprivileged `pwuser` with the
[Playwright 1.55.1 sandbox seccomp profile](https://github.com/microsoft/playwright/blob/v1.55.1/utils/docker/seccomp_profile.json),
which retains a deny-by-default syscall allowlist while permitting Chromium's
user namespace. The container drops every capability, then restores only
`SYS_CHROOT`, which Chromium's sandbox requires when it creates its isolated
root. It never receives `SYS_ADMIN`, uses `--no-sandbox`, or uses an unconfined
seccomp profile.

Set disposable test-only values in the command environment, then run:

```bash
export PROJECT42_BOOTSTRAP_OWNER_ISSUER=https://identity.project42.localhost/realms/project42
export PROJECT42_BROWSER_SMOKE_EMAIL=secure-compose-owner@example.test
export PROJECT42_BROWSER_SMOKE_PASSWORD="$(openssl rand -base64 36)"

docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  up --detach --wait database identity gateway
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  run --rm --no-deps trust-export
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T identity /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://127.0.0.1:8080 --realm master --user bootstrap-admin \
  --password "$PROJECT42_IDENTITY_ADMIN_PASSWORD"
export PROJECT42_BOOTSTRAP_OWNER_SUBJECT="$(
  docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
    exec -T identity /opt/keycloak/bin/kcadm.sh create users -r project42 -i \
    -s "username=$PROJECT42_BROWSER_SMOKE_EMAIL" \
    -s "email=$PROJECT42_BROWSER_SMOKE_EMAIL" \
    -s 'firstName=Secure' -s 'lastName=Compose Owner' \
    -s 'enabled=true' -s 'emailVerified=true'
)"
test -n "$PROJECT42_BOOTSTRAP_OWNER_SUBJECT"
export PROJECT42_BROWSER_SMOKE_SUBJECT="$PROJECT42_BOOTSTRAP_OWNER_SUBJECT"
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T identity /opt/keycloak/bin/kcadm.sh set-password -r project42 \
  --userid "$PROJECT42_BROWSER_SMOKE_SUBJECT" \
  --new-password "$PROJECT42_BROWSER_SMOKE_PASSWORD"
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  up --build --detach --wait
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  --profile test run --rm --build secure-browser-session-smoke
```

The verifier requires the real API callback, an authenticated `/v1/auth/session`
response, the exact provider-issued subject, and a browser-stored `Secure`,
`HttpOnly`, `SameSite=Lax`,
host-only cookie. It also signs out and confirms cookie removal. Do not reuse
these test values as an installation owner or identity-provider credential.

The three browser origins are:

| Surface | Secure local address |
| --- | --- |
| Learn | `https://learn.project42.localhost` |
| Account API | `https://api.project42.localhost` |
| Keycloak | `https://identity.project42.localhost` |

The `.localhost` names resolve to loopback and share the same registrable site,
which permits the API's `Secure`, `HttpOnly`, `SameSite=Lax` session cookie
without weakening its production policy. Inside the Compose network, the API
uses the private TLS name `identity.project42.internal` for token and signing-key
traffic while retaining the public issuer and browser authorization URL. The
verifier explicitly connects each public TLS name to the `gateway` service, so
SNI and certificate validation remain exact without depending on container
`.localhost` resolution.

### Trust the local certificate authority

Do not bypass certificate verification. After the gateway has started, copy
its public root certificate out of the persistent Caddy data volume:

```bash
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  cp gateway:/data/caddy/pki/authorities/local/root.crt ./project42-local-root.crt
```

Trust `project42-local-root.crt` only on the private workstation or lab that
runs this stack:

- Windows: import it into the current user's **Trusted Root Certification
  Authorities** store.
- macOS: add it to the login keychain and set **Always Trust**.
- Linux: use the distribution's documented local CA procedure, commonly
  copying it under `/usr/local/share/ca-certificates/` and running
  `update-ca-certificates`.

Close and reopen the browser after changing trust. Remove that trust when the
lab is retired. The root certificate is public material; the Caddy private CA
key remains inside the `project42_caddy_data` volume and must be protected like
other operational secrets. Compose copies only the public root certificate into
a separate read-only trust volume for the unprivileged API and verifier
containers; neither receives the private CA key.

For an external deployment, put the same services behind a trusted public or
enterprise HTTPS reverse proxy, register the exact API callback, and set:

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

The secure reference realm includes a public PKCE browser client with the exact
`https://api.project42.localhost/v1/auth/callback` redirect. Replace that
registration with the deployment's exact HTTPS API origin for an external
deployment; do not add a wildcard. A production operator may instead provision
a confidential client and place its secret in the deployment's secret manager.

Keycloak 26.7 full access tokens include `auth_time`; both reference clients
explicitly disable lightweight access tokens so bearer authorization retains
that claim. Project 42 sends `prompt=login` and `max_age=0`, validates a fresh
`auth_time`, and binds the ID token to the authorization transaction's
`nonce`. The release tests verify those request and claim contracts. Validate
the same behavior with a real token from any replacement provider before
promotion.

## Back up and restore

The HTTPS profile has four stateful assets that must be captured together:
PostgreSQL learner/account data, profile-photo bytes, the reference Keycloak
identity volume, and Caddy's local-CA state. The Caddy private key is a secret.
The Keycloak volume contains identity records. Store every archive encrypted or
in an access-controlled backup service; never commit it.

For a coherent HTTPS-profile backup, create a private directory, quiesce the
writers, and capture all four assets. The Compose project name is fixed as
`project42-https`, so the named-volume references below are exact:

```bash
backup_directory="$(pwd)/project42-secure-backup-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 0700 "$backup_directory"

docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  stop api identity gateway
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T database \
  pg_dump --format=custom --no-owner --username=project42 project42 \
  > "$backup_directory/project42.pgdump"

for asset in project42_profile_photos project42_identity project42_caddy_data project42_caddy_config; do
  docker run --rm \
    --volume "project42-https_${asset}:/source:ro" \
    --volume "$backup_directory:/backup" \
    alpine:3.23 \
    tar -C /source -czf "/backup/${asset}.tgz" .
done

(cd "$backup_directory" && sha256sum * > SHA256SUMS)
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  up --detach --wait
```

Always rehearse the database restore into an isolated empty database before
approving the backup:

```bash
cd "$backup_directory"
sha256sum -c SHA256SUMS
cd -

docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T database \
  createdb --username=project42 --template=template0 project42_restore_test
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T database \
  pg_restore --exit-on-error --no-owner --username=project42 \
  --dbname=project42_restore_test < "$backup_directory/project42.pgdump"
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T database \
  psql --username=project42 --dbname=project42_restore_test \
  --command="SELECT name, checksum FROM project42_schema_migrations ORDER BY name"
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T database \
  dropdb --username=project42 project42_restore_test

for asset in project42_profile_photos project42_identity project42_caddy_data project42_caddy_config; do
  tar -tzf "$backup_directory/${asset}.tgz" >/dev/null
done
```

The release gate also performs an executable, isolated database, profile-photo,
Keycloak, and Caddy restore against the running test topology. Every source
volume is mounted read-only. Restores go to disposable volumes, and deterministic
path/checksum manifests must match:

```bash
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  --profile test run --rm secure-backup-restore-smoke
```

For an authorized full restore, set `backup_directory` to the reviewed absolute
backup path and run the exact replacement sequence below. These commands
overwrite the current secure-profile database and four named volumes:

```bash
backup_directory=/absolute/path/to/reviewed-project42-secure-backup
(cd "$backup_directory" && sha256sum -c SHA256SUMS)

docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  stop api identity gateway
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T database \
  dropdb --if-exists --force --username=project42 project42
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T database \
  createdb --username=project42 --template=template0 project42
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  exec -T database \
  pg_restore --exit-on-error --no-owner --username=project42 \
  --dbname=project42 < "$backup_directory/project42.pgdump"

for asset in project42_profile_photos project42_identity project42_caddy_data project42_caddy_config; do
  docker run --rm \
    --env "PROJECT42_RESTORE_ASSET=${asset}" \
    --volume "project42-https_${asset}:/target" \
    --volume "$backup_directory:/backup:ro" \
    alpine:3.23 \
    sh -ec '
      find /target -mindepth 1 -delete
      tar -C /target -xzf "/backup/${PROJECT42_RESTORE_ASSET}.tgz"
    '
done

docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml \
  up --detach --wait
```

Do not mix artifacts from different backup sets. Re-import or replay completed
deletion receipts created after the backup before promotion. Validate the
authenticated browser journey and a profile-photo read before reopening
access. A database-only restore can leave photo metadata without its object;
the API fails closed rather than substituting another object.

The HTTP evaluation profile can still be backed up with the same PostgreSQL
`pg_dump` and `pg_restore` commands by substituting `self-host/.env`,
`self-host/compose.yaml`, and its Compose volume names. It is not evidence for
the HTTPS browser-session release gate.

## Stop or reset

Stop without deleting persistent data:

```bash
docker compose --env-file self-host/.env -f self-host/compose.yaml down
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml down
```

The following evaluation-only reset permanently removes its database and
reference-identity volumes:

```bash
docker compose --env-file self-host/.env -f self-host/compose.yaml down --volumes
```

For the HTTPS lab, first remove the copied root certificate from the operating
system trust store. Then remove the stack and its private local-CA key:

```bash
docker compose --env-file self-host/.env.https -f self-host/compose.https.yaml down --volumes
```

## Production boundary

A production deployment must use HTTPS for every browser-facing origin, a
production OIDC service and database configuration, managed secrets, tested
backup and restore, monitoring, and an approved first-owner process. The API
rejects insecure HTTP URLs in `NODE_ENV=production`; setting the evaluation
flag cannot override that rule.

Set `PROJECT42_ACCOUNT_MERGE_REQUIRED_CONSENTS` to the JSON consent requirements
approved for the installation. The supplied evaluation value requires the
default `learning-record` policy version. Retention and legal-hold constraint
creation or release must remain in a separately authorized compliance workflow;
the account service enforces those constraints but does not assign that
authority to its normal administrator role.

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

## Apply an update

Apply updates one release at a time; do not skip a compatibility manifest.

1. Verify the release as described above and review its `compatibility.json`
   for the new `database.migrationHead` and any changed adapter or identity
   contract.
2. Take and rehearse a backup of the current deployment using the
   [Back up and restore](#back-up-and-restore) procedure for the profile in
   use. An update must never be attempted without a rehearsed, checksum-verified
   backup of the same state it will move away from.
3. Set `PROJECT42_VERSION` in `self-host/.env` (or `self-host/.env.https`) to
   the verified release version.
4. Re-run the same start command used for the initial install:

   ```bash
   docker compose --env-file self-host/.env -f self-host/compose.yaml \
     up --build --detach --wait
   ```

   `--wait` gates on the API's `GET /health` probe. The API applies every
   unapplied, checksum-locked PostgreSQL migration under an advisory lock
   before it reports healthy; a migration file that already applied and then
   changed causes startup to fail instead of silently altering the schema. If
   `--wait` times out or exits non-zero, the update did not reach a healthy
   state; do not route traffic to it.
5. Confirm the new version is serving:

   ```bash
   curl --fail http://localhost:8787/health
   docker compose --env-file self-host/.env -f self-host/compose.yaml \
     exec -T database psql --username=project42 --dbname=project42 \
     --command="SELECT name FROM project42_schema_migrations ORDER BY applied_at DESC LIMIT 5"
   ```

## Roll back a failed update

PostgreSQL migrations in this repository are forward-only: applying an update
can add schema that an older image does not understand, so re-pinning
`PROJECT42_VERSION` to the previous release **does not** by itself undo a
migration that already committed. Treat rollback as a restore, not a version
downgrade:

1. Stop the stack so nothing writes to the database during rollback:

   ```bash
   docker compose --env-file self-host/.env -f self-host/compose.yaml stop api identity
   ```

2. Restore the database (and, for the HTTPS profile, the identity, profile-photo,
   and Caddy volumes) from the pre-update backup captured in step 2 of
   [Apply an update](#apply-an-update), following the restore commands in
   [Back up and restore](#back-up-and-restore). Verify the restored
   `SHA256SUMS` and the migration inventory match the pre-update state before
   continuing.
3. Set `PROJECT42_VERSION` back to the prior, previously verified release.
4. Start the stack again with the same `up --build --detach --wait` command and
   confirm `GET /health` reports healthy before restoring traffic.

If the update failed before any new migration committed (the advisory-locked
transaction for each migration file rolls back on error, so a mid-migration
failure never leaves a half-applied file), re-pinning `PROJECT42_VERSION` to
the prior release and restarting the stack is sufficient and the database
restore in step 2 is not required. Confirm this by comparing
`project42_schema_migrations` against the pre-update backup's migration
inventory; do not assume it without checking.

See [Identity providers](identity-providers.md) for the adapter contract and
[learner data policy](../learner-data-policy.md) for retention, deletion, and
recovery controls.

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
cp self-host/.env.example .env
```

Replace both example passwords in `.env` with different random values of at
least 24 characters. Keep that file out of source control.

```bash
docker compose -f self-host/compose.yaml config --quiet
docker compose -f self-host/compose.yaml up --build --detach --wait
curl --fail http://localhost:8787/health
```

The services are:

| Service | Local address | Purpose |
| --- | --- | --- |
| Account API | `http://localhost:8787` | Accounts, authorization, progress, transcripts, badges, privacy, and audit |
| Keycloak | `http://localhost:8080` | Replaceable reference OIDC provider |
| PostgreSQL | internal only | Durable learner and administrative records |

The API applies checksum-locked PostgreSQL migrations under an advisory lock
before accepting traffic. A changed migration that has already been applied
causes startup to fail instead of silently changing the database.

This repository does not assign a default owner. After a user signs in, use a
reviewed bootstrap-owner issuer and subject for the first owner or approve the
account through an existing owner. Never use an email address as the immutable
owner key.

## Connect a Learn build

Build Project 42 Learn with these public values:

```text
NEXT_PUBLIC_PROJECT42_API_ORIGIN=http://localhost:8787
NEXT_PUBLIC_PROJECT42_OIDC_AUTHORITY=http://localhost:8080/realms/project42
NEXT_PUBLIC_PROJECT42_OIDC_CLIENT_ID=project42-learn
NEXT_PUBLIC_PROJECT42_OIDC_SCOPE=openid profile email
```

Serve that build at `http://localhost:3000`, which is the redirect origin in
the reference realm. This is a public-client Authorization Code with PKCE
configuration; it has no client secret and does not enable password grants.

## Back up and restore

Create an encrypted or access-controlled backup outside the repository:

```bash
docker compose -f self-host/compose.yaml exec -T database \
  pg_dump --format=custom --no-owner --username=project42 project42 \
  > project42.backup
```

Test restoration in an isolated empty database:

```bash
docker compose -f self-host/compose.yaml exec -T database \
  createdb --username=project42 project42_restore_test
docker compose -f self-host/compose.yaml exec -T database \
  pg_restore --exit-on-error --no-owner --username=project42 \
  --dbname=project42_restore_test < project42.backup
```

Delete the restore-test database after validation:

```bash
docker compose -f self-host/compose.yaml exec -T database \
  dropdb --username=project42 project42_restore_test
```

Backups contain learner and identity-adjacent records. Encrypt them, restrict
access, document retention, and replay completed deletion tombstones after any
production restore.

## Stop or reset

Stop without deleting persistent data:

```bash
docker compose -f self-host/compose.yaml down
```

The following evaluation-only reset permanently removes its database and
reference-identity volumes:

```bash
docker compose -f self-host/compose.yaml down --volumes
```

## Production boundary

A production deployment must use HTTPS for every browser-facing origin, a
production OIDC service and database configuration, managed secrets, tested
backup and restore, monitoring, and an approved first-owner process. The API
rejects insecure HTTP URLs in `NODE_ENV=production`; setting the evaluation
flag cannot override that rule.

See [Identity providers](identity-providers.md) for the adapter contract and
[learner data policy](../learner-data-policy.md) for retention, deletion, and
recovery controls.

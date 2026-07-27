# Self-host release 0.49.1

Release 0.49.1 completes the evaluation reference topology by adding the
version-pinned Project 42 Learn image to the account API, PostgreSQL, and
Keycloak services delivered in 0.49.0. It also expands the signed
compatibility manifest with component digests, supported and unsupported
ranges, migration evidence, an integrity policy, and release-status metadata.

## Breaking changes

- The Compose profile now binds host port 3000 for Learn.
- The supported reference requires Learn 0.4.x; earlier Learn releases do not
  carry the self-host image and compatibility contract.
- The compatibility manifest schema adds required component, range,
  migration, integrity, release-status, and release-note fields.

## Backup before update

Back up both PostgreSQL and the identity-provider data before replacing an
existing evaluation deployment. Follow the tested `pg_dump` and isolated
restore procedure in [Docker Compose deployment](docker-compose.md#back-up-and-restore).
Keep backups encrypted or access-controlled because they contain learner and
identity-adjacent records.

## Migrations

Migration `001_initial.sql` remains the required database head. Startup takes
an advisory lock and checks the recorded SHA-256 digest before accepting
traffic. A missing, altered, or partially applied migration fails closed.

## Limitations

This remains an evaluation profile. Keycloak uses development mode, endpoints
use HTTP on `localhost`, first-owner bootstrap remains an explicit reviewed
operation, and browser configuration is compiled into the Learn image. A
production installation requires HTTPS, production identity and database
settings, secret management, monitoring, and tested recovery.

## Rollback

1. Stop the stack without deleting volumes.
2. Restore the pre-update database backup into an isolated database and
   validate it.
3. Set `PROJECT42_VERSION=0.49.0` and remove or disable the Learn service if
   returning to the previous three-service evaluation profile.
4. Start the prior profile and validate API health, identity discovery,
   account authorization, progress, transcript, export, consent, and deletion.

Do not roll a database backward across an irreversible migration without the
matching backup. Never use `docker compose down --volumes` as a rollback.

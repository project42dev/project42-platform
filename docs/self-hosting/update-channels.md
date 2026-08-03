# Update channels

This document describes how a self-hosted Project 42 installation is meant
to move between releases: the deployment profiles this repository supports,
what a "release" is made of, how an administrator learns that an update
exists, and the sequence used to apply and, if necessary, undo one. It
complements [Docker Compose evaluation deployment](docker-compose.md), which
already contains the concrete, executable verify/apply/roll-back commands
for the reference profile. Read this document for the model; read that one
for the commands.

## Supported deployment profiles

| Profile | Purpose | Status in this repository |
| --- | --- | --- |
| Local learning | Static/public content plus device-local records, no accounts | Not part of this repository's release-unit or update-channel model |
| Reference self-host | Containerized app, PostgreSQL, object storage, and standards-based OIDC | Implemented: `self-host/compose.yaml` (HTTP evaluation) and `self-host/compose.https.yaml` (HTTPS profile). The current compatibility manifest declares `supportLevel: "evaluation"`, not `"production"` |
| Hosted Project42dev | Managed deployment using the same public domain contracts | Operated by Project42dev outside this repository; not a release unit this repository ships |
| Custom enterprise | Alternate identity, storage, or analytics adapters | Not a distinct shipped profile; a custom adapter must satisfy the same conformance boundary described in [Identity providers](identity-providers.md) and [Cloudflare D1 deployment](cloudflare-d1.md) |

## Release units

An update touches some combination of these units, and they version and
declare compatibility independently:

| Unit | Versioning | Compatibility |
| --- | --- | --- |
| Application | Semantic version | Declares supported schema/content ranges |
| Database schema | Monotonic migration file name | Forward migration plus a documented restore path |
| Content package | Semantic version | Declares minimum/maximum platform version |
| Training package | Semantic version plus digest | Declares player protocol and accessibility capabilities (see [Training package format](../training-package-format.md) for the current status of that contract) |
| Adapter | Semantic version | Must pass the public conformance suite |

Private PMO data and Project42dev's own deployment configuration are never
release units of this repository.

## The compatibility manifest

`self-host/compatibility.json`, validated against
`self-host/compatibility.schema.json`, is the real, shipped record that
binds these units together for one release. It is not a sketch; `npm run
self-host:validate` and `npm run release:check` both fail the build if it
drifts from `package.json`'s version, from the newest file under
`self-host/postgres/`, or from the Docker Compose service definitions. Its
`update` section is:

```json
{
  "update": {
    "channel": "github-release",
    "automaticApply": false,
    "signature": "sigstore-keyless"
  }
}
```

The schema currently pins all three of those fields to constants: `channel`
must be `"github-release"`, `automaticApply` must be `false`, and
`signature` must be `"sigstore-keyless"`. That is a precise, load-bearing
fact about what exists today, not a design choice being described loosely:
there is exactly one update channel implemented, and it never applies
itself.

## Configuration contract

Runtime configuration belongs in environment variables or a secret store,
not in source: the public URL and trusted proxy/origin settings, identity
issuer/client/redirect/secret references, the database connection, object
or media storage, an email adapter if configured, an analytics adapter and
consent mode, session/encryption/signing/export keys, and branding or
content-package selections. Startup validates configuration and refuses
unsafe defaults in production. See [Configure an identity
provider](identity-providers.md) for the OIDC variable names, [Run the
Project 42 API on Cloudflare Workers and D1](cloudflare-d1.md) for the
hosted adapter's variables, and [Docker Compose evaluation
deployment](docker-compose.md) for the reference profile's `.env` files.

## Manual and subscribed channels

### Manual

An administrator downloads a signed release manifest, reviews release notes
and compatibility, backs up data, runs preflight checks, applies migrations
and packages, validates health, and promotes the release. This is the only
channel implemented today. [Docker Compose evaluation
deployment](docker-compose.md) documents the exact commands: `cosign
verify-blob` against the release archive and `compatibility.json`, review of
`compatibility.json`'s `database.migrationHead` and any changed adapter or
identity contract, a rehearsed backup, setting `PROJECT42_VERSION`, and
re-running the same `docker compose ... up --build --detach --wait` command
used for the initial install. `--wait` gates promotion on the API's `GET
/health` probe; the API applies every unapplied, checksum-locked PostgreSQL
migration under an advisory lock before it reports healthy, and a migration
file that already applied and then changed causes startup to fail instead of
silently altering the schema.

### Subscribed

A scheduled job would fetch signed manifests from a selected stable or
security channel, download artifacts, verify digest and signature and
compatibility, and create an administrator-visible update proposal. It would
not migrate or promote automatically unless an operator explicitly enabled a
future policy after a successful backup and preflight.

This channel does not exist in this repository. There is no scheduler, no
second `channel` value distinguishing, for example, a stable release train
from a security-only one, and no code that creates an update proposal
without an administrator running the manual procedure above. The
`self-host/compatibility.schema.json` constants described above are the
concrete evidence: `channel` accepts only `"github-release"` today.

Content-package and training-package update subscriptions, as distinct from
the application/database update channel described here, are meant to follow
the same preview-and-human-approval rule as any other governed content
change. See [Content freshness pipeline](../content-freshness-pipeline.md)
and [Governed content-maintenance contracts](../content-maintenance-contracts.md)
for that rule and for what of it is actually implemented.

## Safe update sequence

The target sequence for an update, regardless of channel, is:

1. Export a configuration inventory and verify supported versions.
2. Create and verify database and object-store backups.
3. Download the manifest and artifacts; verify digest and provenance.
4. Run schema, configuration, storage-capacity, and adapter preflight.
5. Apply expand-compatible database migrations.
6. Deploy the new application version and run health and conformance
   checks before it takes traffic.
7. Promote traffic to the new version.
8. Apply content and training packages.
9. Record release evidence and monitor.

Rollback returns application traffic to the previous compatible version.
Destructive schema changes require a restore or a tested reverse migration;
never claim "rollback supported" without having rehearsed it.

**What the reference Compose profile actually does today.** The idealized
nine-step sequence above describes the target model, including a
non-serving deployment slot for step 6. The shipped Docker Compose
reference implementation is simpler and does not do a blue-green or
non-serving-slot deploy: migrations apply automatically, under an advisory
lock, at container startup (folding steps 4 through 6 into one `up
--build --detach --wait` invocation), and `--wait` is the only readiness
gate before the new version is considered promoted. See [Docker Compose
evaluation deployment](docker-compose.md#apply-an-update) for the exact,
current procedure, and its companion [rollback
procedure](docker-compose.md#roll-back-a-failed-update), which treats
rollback as a restore rather than a version downgrade, because PostgreSQL
migrations in this repository are forward-only.

## Backup and recovery contract

- Database and object/media backups carry the same retention and
  encryption class.
- Restore tests run on a schedule, not only after an incident.
- Encryption and signing keys have separate recovery procedures from data
  backups.
- Deletion tombstones are replayed when restoring an older backup, so a
  restore cannot silently reactivate a deleted learner record. See
  [Learning-record recovery](../learning-record-recovery.md).
- The operator chooses recovery objectives before relying on this contract
  in production.
- Update preflight is meant to block when the last verified backup is
  outside policy; today this is a documented human step, not an automated
  gate.

[Docker Compose evaluation deployment](docker-compose.md#back-up-and-restore)
is the concrete, executable version of this contract for the reference
profile: it documents the exact `pg_dump`/`pg_restore` and per-volume
archive commands, and CI runs an isolated, disposable-volume backup/restore
smoke test (`secure-backup-restore-smoke`) against the HTTPS profile on
every change.

## Conformance suite

A supported installer or reference profile is expected to prove:

- a clean install from public documentation;
- configuration validation and secret isolation;
- identity and storage adapter semantics;
- idempotent retry and transcript rebuild;
- export and deletion;
- backup and restore;
- application/content compatibility rejection;
- update preview, apply, health check, and rollback; and
- no network or build dependency on this project's private operations
  repository.

`npm run self-host:validate` (part of `npm run check`) is the real,
automated check against most of this list today: it validates
`self-host/compatibility.json` against its schema, checks that the release
version, image tag, and migration head all agree with `package.json` and
the migration files actually shipped, and checks that the Compose files,
Caddy configuration, Keycloak realm export, and CI workflow still contain
the specific fragments that enforce the HTTPS profile's security posture
(loopback-only Caddy admin, `Secure`/`HttpOnly`/`SameSite=Lax` session
cookies, a sandboxed browser-smoke container, and the backup/restore and
container-scanning CI jobs). It does not, today, execute an actual
update-then-rollback drill as an automated test; update and rollback remain
documented, human-executed procedures in [Docker Compose evaluation
deployment](docker-compose.md), not something CI applies and reverts on
every run.

## Current implementation status

Implemented and enforced by automated checks: the compatibility manifest
and its schema, version/migration-head alignment, the manual update and
rollback procedure for the Docker Compose reference profile, the backup and
restore smoke test, and the release-signing and verification steps.

Not implemented: a subscribed update channel, any second value of the
`channel` field, an automated update-then-rollback conformance test, and a
non-serving-slot (blue-green) deployment mode. Treat the "Safe update
sequence" and "Subscribed" sections above as the direction this contract is
meant to grow toward, and the "What the reference Compose profile actually
does today" note and [Docker Compose evaluation
deployment](docker-compose.md) as the current, executable reality.

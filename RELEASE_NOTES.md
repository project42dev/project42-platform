# Project 42 platform v0.69.0

Version 0.69.0 strengthens the reusable account boundary and makes the public release
contract independently inspectable. It includes tenant-aware authorization, safer
OIDC expiry recovery, portable PostgreSQL timestamps, and a versioned set of platform,
content, migration, compatibility, checksum, provenance, and rehearsal artifacts.

## Breaking changes

No public TypeScript export is removed in this release. Deployments must nevertheless
treat authorization as a behavior change: tenant-scoped operations now reject missing,
ambiguous, or cross-tenant authority instead of relying on an implicit hosted default.
Custom clients or adapters that omitted tenant context must supply the documented
tenant and role claims before upgrading.

The release artifact names are now versioned and the strict release manifest rejects
unknown fields, missing artifact roles, non-canonical checksums, or version drift.
Update automation that consumed the former unversioned `compatibility.json` asset must
read `project42-compatibility-v0.69.0.json` through the release manifest.

## Migrations

The compatibility manifest records PostgreSQL migration head
`013_account_notification_outbox.sql`. Apply every migration through that file in
order. Hosted Cloudflare D1 deployments use their separately governed numbered D1
migrations and must not apply PostgreSQL files.

Before applying migrations:

1. Stop write traffic or use the deployment's documented maintenance boundary.
2. Capture and verify a restorable database backup.
3. Record the current application and image digest.
4. Preview the migration and confirm adapter, identity, and notification settings.

After applying migrations, verify the health endpoint, authorization boundaries,
profile timestamps, notification outbox, learning-event append, transcript rebuild,
and an authenticated session before restoring normal traffic.

## Known limitations

- The compatibility support level is `evaluation`; this is not an availability SLA.
- Identity providers, email delivery, domains, secrets, and first-owner authority are
  deployment-specific and are not created by the public package.
- Automatic update application is intentionally unsupported. An administrator must
  review and approve each update.
- PostgreSQL is the reference self-host database. Cloudflare D1 is the hosted adapter
  and has a distinct migration sequence.
- The local release rehearsal proves artifact integrity and rollback mechanics without
  credentials; it does not replace a deployment-specific backup/restore or production
  login exercise.

## Rollback

Retain the previous signed archive, OCI digest, compatibility manifest, release
manifest, checksums, and database backup until post-upgrade validation is accepted.

If application validation fails before a non-reversible data change, route traffic
back to the previous immutable image digest or package, restore the previous
configuration overlay, and verify health and login. Database migrations are
forward-only by default. If the new application wrote data that the previous version
cannot read, stop writes and restore the verified pre-upgrade backup instead of
manually editing migration history.

After rollback, rebuild transcripts from authoritative learning events, verify account
and tenant boundaries, record the failed version and evidence, and do not retry until
the cause and recovery path are understood.

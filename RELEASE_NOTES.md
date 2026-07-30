# Project 42 platform v0.70.2

Version 0.70.2 preserves the reusable hosted and self-host account boundary from
v0.70.1 and adds a bounded browser-only clock-skew tolerance for OIDC ID tokens.
The tolerance applies only when the callback validates both its nonce and fresh
authentication time. Bearer access tokens remain strict, and every signature,
issuer, audience, authorized-party, nonce, and authentication-time check remains
fail-closed.

Version 0.70.1 preserved the reusable hosted and self-host account boundary from
v0.70.0 and fixed cross-platform Cloudflare D1 migration checksum verification.
The migration runner now hashes a byte-preserving LF-normalized representation,
accepts equivalent legacy LF- or CRLF-bound ledger records without rewriting
them, and continues to reject every substantive migration change.

Version 0.70.0 made the reusable hosted and self-host account boundary materially
easier to verify before production promotion. It adds privacy-safe evidence for the
signed verified-email contract, encrypted owner-administration cursors, and a secure
HTTPS Compose acceptance path that exercises a real browser through Learn, Keycloak,
the API callback, an API-owned `HttpOnly` session, and sign-out.

The secure distribution now includes repeatable database, profile-photo, identity,
and gateway backup and restore checks. Deterministic configuration and secret scans,
all-image critical-vulnerability scanning, non-root runtime checks, constrained
container capabilities, and an explicit browser seccomp policy run as release gates.
The affected Caddy, curl, PostgreSQL helper, API runtime, and browser-smoke images use
remediated bases.

Owner account and audit listings continue to use bounded keyset pagination. Their
continuation values are now encrypted and authenticated with a purpose-specific key
derived from `SESSION_ENCRYPTION_KEY`; they are bound to the installation, query
type, and account-state filter and fail closed when altered or replayed outside that
context.

Release candidate upload and download use immutable GitHub Actions revisions that
run on the supported Node 24 action runtime. The release workflow continues to
publish versioned manifests, checksums, provenance, attestations, and a signed OCI
image.

## Breaking changes

No public TypeScript export is removed in this release.

Administration cursors issued before this release are intentionally incompatible
with the encrypted cursor contract. Rotating `SESSION_ENCRYPTION_KEY` also
invalidates outstanding cursors. Clients receiving `invalid_admin_cursor` must
discard the continuation value and restart the same query from its first page.
Clients must never parse or construct cursors.

Secure self-host installations should recreate containers from the v0.70.2 images
rather than retaining the older utility or runtime images. The HTTPS profile exposes
only its gateway on TCP 443 and expects the documented local trust setup; automation
that depended on direct host access to an internal service is outside the supported
secure topology.

## Migrations

There is no new PostgreSQL migration in v0.70.2. The compatibility manifest retains
migration head `013_account_notification_outbox.sql`. Apply every migration through
that file in order when upgrading from an older release. Hosted Cloudflare D1
deployments use their separately governed numbered D1 migrations and must not apply
PostgreSQL files.

Before upgrading:

1. Stop write traffic or use the deployment's documented maintenance boundary.
2. Capture and verify a restorable database backup.
3. Record the current application and immutable image digest.
4. Preserve profile-photo, identity-provider, gateway data, and configuration.
5. Preview the v0.70.2 compatibility and release manifests.

After upgrading, verify health, the authenticated browser-session lifecycle, owner
account and audit pagination, authorization boundaries, profile storage, learning
events, transcript rebuild, and backup restoration before restoring normal traffic.
For hosted deployments, keep exact-domain automatic approval disabled until a real
signed token from every enabled sign-in method proves that `email_verified` is the
JSON Boolean `true`.

## Known limitations

- The compatibility support level remains `evaluation`; this is not an availability
  SLA.
- The secure Compose browser exercise uses the documented Keycloak reference
  provider. Each deployment owner must separately validate its real provider,
  callback registration, token claims, and first-owner journey.
- Identity providers, email delivery, domains, secrets, and first-owner authority are
  deployment-specific and are not created by the public package.
- Automatic update application remains unsupported. An administrator must inspect
  and approve every update.
- PostgreSQL is the reference self-host database. Cloudflare D1 is the hosted adapter
  and has a distinct migration sequence.
- The owner interface must follow every account or audit continuation page before it
  can claim to have reviewed a complete large-installation result set.

## Rollback

Retain the previous signed archive, OCI digest, compatibility manifest, release
manifest, checksums, database backup, profile-photo backup, identity data, and
gateway data until post-upgrade validation is accepted.

If validation fails before a non-reversible data change, route traffic back to the
previous immutable image digest, restore the previous configuration overlay, and
verify health and login. Database migrations are forward-only by default. If the new
application wrote data that the previous version cannot read, stop writes and
restore the verified pre-upgrade backup instead of editing migration history.

After rollback, rebuild transcripts from authoritative learning events, verify
account and tenant boundaries, and record the failed version and evidence. Previously
issued encrypted administration cursors are disposable client state: discard them
and restart pagination after any rollback or session-key change.

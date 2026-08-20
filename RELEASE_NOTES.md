# Project 42 platform v0.80.0

Version 0.80.0 was cut by the Orchard release role from everything merged into `main` since v0.79.0. It exists so that content already merged into the platform repository reaches the sites that consume the platform package.

## Content

Added:



- `content/modules/discovery/cost.json`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/executive.json`
- `content/modules/discovery/langchain.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/voice-agent.json`

Changed:



- `content/catalog.json`

## Migrations

No file under `migrations/` was added or changed since v0.79.0.

## Breaking changes

Orchard does not classify breaking changes. Review the file list above, and the diff for this tag, before approving the release environment.

## Known limitations

None are recorded by the automation that cut this release. It reports what changed; it does not assess it.

## Rollback

Revert consuming sites to v0.79.0.

# Project 42 platform v0.79.0

Version 0.79.0 was cut by the Orchard release role from everything merged into `main` since v0.78.0. It exists so that content already merged into the platform repository reaches the sites that consume the platform package.

## Content

Added:



- `content/modules/discovery/rag.json`

Changed:



- `content/catalog.json`

## Migrations

No file under `migrations/` was added or changed since v0.78.0.

## Breaking changes

Orchard does not classify breaking changes. Review the file list above, and the diff for this tag, before approving the release environment.

## Known limitations

None are recorded by the automation that cut this release. It reports what changed; it does not assess it.

## Rollback

Revert consuming sites to v0.78.0.

# Project 42 platform v0.78.0

Version 0.78.0 was cut by the Orchard release role from everything merged into `main` since v0.77.0. It exists so that content already merged into the platform repository reaches the sites that consume the platform package.

## Content

Changed:



- `content/training/ai-foundations/what-ai-does/alternatives/en-US-reduced-motion.md`
- `content/training/ai-foundations/what-ai-does/alternatives/en-US-text-only.md`
- `content/training/ai-foundations/what-ai-does/transcripts/en-US.md`

## Migrations

No file under `migrations/` was added or changed since v0.77.0.

## Breaking changes

Orchard does not classify breaking changes. Review the file list above, and the diff for this tag, before approving the release environment.

## Known limitations

None are recorded by the automation that cut this release. It reports what changed; it does not assess it.

## Rollback

Revert consuming sites to v0.77.0.

# Project 42 platform v0.77.0

Version 0.77.0 was cut by the Orchard release role from everything merged into `main` since v0.76.0. It exists so that content already merged into the platform repository reaches the sites that consume the platform package.

## Content

Changed:



- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`

## Migrations

No file under `migrations/` was added or changed since v0.76.0.

## Breaking changes

Orchard does not classify breaking changes. Review the file list above, and the diff for this tag, before approving the release environment.

## Known limitations

None are recorded by the automation that cut this release. It reports what changed; it does not assess it.

## Rollback

Revert consuming sites to v0.76.0.

# Project 42 platform v0.76.0

Version 0.76.0 was cut by the Orchard release role from everything merged into `main` since v0.75.0. It exists so that content already merged into the platform repository reaches the sites that consume the platform package.

## Content

Added:



- `content/modules/discovery/fine-tuning.json`
- `content/modules/discovery/vector.json`

Changed:



- `content/catalog.json`

## Migrations

No file under `migrations/` was added or changed since v0.75.0.

## Breaking changes

Orchard does not classify breaking changes. Review the file list above, and the diff for this tag, before approving the release environment.

## Known limitations

None are recorded by the automation that cut this release. It reports what changed; it does not assess it.

## Rollback

Revert consuming sites to v0.75.0.

# Project 42 platform v0.75.0

Version 0.75.0 was cut by the Orchard release role from everything merged into `main` since v0.74.0. It exists so that content already merged into the platform repository reaches the sites that consume the platform package.

## Content

Changed:



- `content/catalog.json`
- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`

## Migrations

No file under `migrations/` was added or changed since v0.74.0.

## Breaking changes

Orchard does not classify breaking changes. Review the file list above, and the diff for this tag, before approving the release environment.

## Known limitations

None are recorded by the automation that cut this release. It reports what changed; it does not assess it.

## Rollback

Revert consuming sites to v0.74.0.

# Project 42 platform v0.74.0

Version 0.74.0 was cut by the Orchard release role from everything merged into `main` since v0.73.0. It exists so that content already merged into the platform repository reaches the sites that consume the platform package.

## Content

Added:



- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`

## Migrations

No file under `migrations/` was added or changed since v0.73.0.

## Breaking changes

Orchard does not classify breaking changes. Review the file list above, and the diff for this tag, before approving the release environment.

## Known limitations

None are recorded by the automation that cut this release. It reports what changed; it does not assess it.

## Rollback

Revert consuming sites to v0.73.0.

# Project 42 platform v0.72.1

Version 0.72.1 persists the one-time terms acceptance made during an account
request even when the request remains pending and therefore has no learner
session. The private registration receipt authenticates this narrowly scoped
write without granting access to modules or learner records.

Both receipt-backed and signed-in acceptance retries are idempotent. A database
constraint guarantees one current terms grant per learner and policy version,
including under concurrent retries.

## Breaking changes

None.

## Migrations

Migration 0019 removes duplicate current terms grants, retaining one existing
grant for each learner and policy version, and adds the uniqueness constraint.

## Known limitations

None new in this release.

## Rollback

Revert application code to v0.72.0. The added uniqueness index is compatible
with v0.72.0 behavior and may remain in place.

# Project 42 platform v0.72.0

Version 0.72.0 centralizes all Mermaid diagram sources and their catalogue under
`content/diagrams/`, adds currency fields to every Learn module, and bumps the
recovery contract version to 1.2.

Diagram sources previously scattered across individual content modules now live in
a single `content/diagrams/` directory with a `catalogue.json` export. Downstream
consumers (learn, guide, project-42.dev) reference diagrams through the platform
package rather than maintaining their own copies.

All 66 Learn modules now carry explicit `reviewCadenceDays` and `lastVerified`
fields, replacing the previous implicit currency model. This makes content
freshness measurable and automatable.

The recovery contract version moves from 1.1 to 1.2, reflecting the updated
recovery report schema. Self-host compatibility manifests and example
environments are updated accordingly.

## Breaking changes

None.

## Migrations

No database migrations are required. The recovery contract version bump is a
schema-only change; existing recovery backups remain valid.

## Known limitations

None new in this release.

## Rollback

Revert to v0.71.0. Recovery backups created under v0.72.0 use the 1.2 contract
but remain structurally compatible with the v0.71.0 recovery path.

# Project 42 platform v0.71.0

Version 0.71.0 lets a learner resolve their own duplicate account without owner
involvement, adds a provider-neutral delivery adapter for account notifications,
and allows the browser session to be scoped across sibling subdomains.

Account reconciliation gains learner-scoped `complete`, `receipt`, and `rollback`
routes under `/v1/me/account-merges/:id`. Each requires the caller to be the
source or survivor of that specific merge, mirroring the guard the preview route
already used. The owner-scoped routes are unchanged; this adds a self-service
path rather than widening owner authority.

Account notifications are delivered through a separate
`ACCOUNT_NOTIFICATION_DELIVERY` Worker reached by service binding, with a Resend
implementation behind `POST /v1/deliver`. The delivery provider is now
replaceable without touching account logic, matching the adapter pattern used
elsewhere in the platform.

The browser session cookie can be scoped across sibling subdomains through the
optional `SESSION_COOKIE_DOMAIN` variable. Leaving it unset preserves the
previous host-only behavior exactly. Enabling it required renaming the session
cookie to `__Secure-project42_session`, because a browser rejects a `__Host-`
cookie outright when it carries a `Domain` attribute.

Version 0.70.2 preserved the reusable hosted and self-host account boundary from
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

The browser session cookie is renamed from `__Host-project42_session` to
`__Secure-project42_session`. Sessions issued before this release are not read
back after upgrading, so every signed-in browser is signed out once and must
sign in again. No account data is affected. Any automation, smoke test, or
monitoring that matched the previous cookie name by string must be updated.

Administration cursors issued before this release are intentionally incompatible
with the encrypted cursor contract. Rotating `SESSION_ENCRYPTION_KEY` also
invalidates outstanding cursors. Clients receiving `invalid_admin_cursor` must
discard the continuation value and restart the same query from its first page.
Clients must never parse or construct cursors.

Secure self-host installations should recreate containers from the v0.71.0 images
rather than retaining the older utility or runtime images. The HTTPS profile exposes
only its gateway on TCP 443 and expects the documented local trust setup; automation
that depended on direct host access to an internal service is outside the supported
secure topology.

## Migrations

There is no new PostgreSQL migration in v0.71.0. The compatibility manifest retains
migration head `013_account_notification_outbox.sql`. Apply every migration through
that file in order when upgrading from an older release. Hosted Cloudflare D1
deployments use their separately governed numbered D1 migrations and must not apply
PostgreSQL files.

Before upgrading:

1. Stop write traffic or use the deployment's documented maintenance boundary.
2. Capture and verify a restorable database backup.
3. Record the current application and immutable image digest.
4. Preserve profile-photo, identity-provider, gateway data, and configuration.
5. Preview the v0.71.0 compatibility and release manifests.

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

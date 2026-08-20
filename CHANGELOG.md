# Changelog

All notable reusable platform changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and released versions use
semantic versioning.

## [0.78.0] - 2026-08-20

### Changed

- `content/training/ai-foundations/what-ai-does/alternatives/en-US-reduced-motion.md`
- `content/training/ai-foundations/what-ai-does/alternatives/en-US-text-only.md`
- `content/training/ai-foundations/what-ai-does/transcripts/en-US.md`

## [0.77.0] - 2026-08-20

### Changed

- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`

## [0.76.0] - 2026-08-20

### Added

- `content/modules/discovery/fine-tuning.json`
- `content/modules/discovery/vector.json`

### Changed

- `content/catalog.json`

## [0.75.0] - 2026-08-19

### Changed

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

## [0.74.0] - 2026-08-19

### Added

- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`

## [0.72.1] - 2026-08-06

### Added

- Pending account requests can persist required terms acceptance through their
  private registration receipt without receiving a learner session.

### Fixed

- Current terms acceptance is now idempotent and database-enforced as one grant
  per learner and policy version across registration and signed-in retries.

## [0.72.0] - 2026-08-04

### Added

- Centralized Mermaid diagram sources and catalogue under `content/diagrams/`,
  with a `catalogue.json` export for downstream consumers.

### Changed

- All 66 Learn modules now carry explicit `reviewCadenceDays` and `lastVerified`
  currency fields.
- Recovery contract version bumped to 1.2.

## [0.71.0] - 2026-08-01

### Added

- An `ACCOUNT_NOTIFICATION_DELIVERY` Worker provides a provider-neutral delivery
  adapter for account notifications, with a Resend implementation behind
  `POST /v1/deliver`. The account service reaches it through a service binding,
  so the delivery provider can be replaced without changing account logic.
- Learners can complete, fetch the receipt for, and roll back their own account
  reconciliation through `/v1/me/account-merges/:id/{complete,receipt,rollback}`.
  Each route requires the caller to be the source or survivor of that merge.
  Owner involvement is no longer required for a learner to resolve their own
  duplicate account.
- An optional `SESSION_COOKIE_DOMAIN` variable scopes the browser session cookie
  across sibling subdomains. Leaving it unset preserves the previous host-only
  behavior exactly.

### Changed

- The browser session cookie is named `__Secure-project42_session` rather than
  `__Host-project42_session`. A `__Host-` cookie carrying a `Domain` attribute is
  rejected outright by the browser under RFC 6265bis §4.1.3, so the prefix had to
  change for `SESSION_COOKIE_DOMAIN` to be usable at all. `__Secure-` is still
  browser-enforced to require `Secure`. The one-time OIDC transaction and
  registration receipt cookies remain `__Host-`; they are single-flow and never
  need cross-subdomain scope.

### Fixed

- Completing a merge no longer fails with a `NOT NULL` constraint violation on
  `user_profiles.reduced_motion` when neither account has ever opened profile
  settings. The merge built an explicit insert that bound `NULL` over the
  column's own SQL default; it now falls back to that default. This path was
  reachable in the new learner-initiated flow, where two freshly registered
  duplicate accounts can be merged before either has profile settings.

## [0.70.2] - 2026-07-30

### Fixed

- Browser OIDC ID-token validation now allows a bounded 60-second clock-skew
  tolerance when both nonce validation and fresh-authentication evidence are
  required. Bearer access-token validation remains strict.
- Tokens outside that bound, or with an invalid signature, issuer, audience,
  authorized party, nonce, or authentication time, continue to fail closed.

## [0.70.1] - 2026-07-30

### Fixed

- Cloudflare D1 migration checksums now use a line-ending-neutral LF contract
  while accepting equivalent legacy LF- and CRLF-bound ledger records without
  rewriting production history.
- Substantive migration changes remain fail-closed and checksum-bound byte for
  byte apart from line-ending normalization.

## [0.70.0] - 2026-07-30

### Added

- Privacy-safe signed-token diagnostics for accepting or rejecting the verified-email
  claim contract without recording identity values.
- A secure HTTPS Compose profile that proves the Learn-to-identity-to-API browser
  journey with API-owned `HttpOnly` sessions, trusted local TLS, backup and restore,
  deterministic configuration checks, and container vulnerability gates.
- Encrypted, authenticated continuation cursors for bounded owner account and audit
  administration queries.

### Changed

- Secure Compose validation consumes the redirect-safe Learn release and verifies
  sign-in, callback, session use, sign-out, and recovery from a clean browser.
- Release artifact upload and download steps use immutable Node 24-compatible GitHub
  Actions revisions.
- Secure backup checksum verification is portable across the supported Alpine-based
  utility images.

### Security

- Secure self-host images were rebuilt on remediated Caddy, curl, PostgreSQL, API,
  and browser-smoke bases and the release gate now rejects critical image
  vulnerabilities.
- Browser smoke and API containers run as non-root with constrained capabilities and
  an explicit browser seccomp profile.
- Administration cursors fail closed after tampering, secret rotation, or reuse
  across installations, query types, or account-state filters.

### Known limitations

- The self-host compatibility level remains `evaluation`.
- Real provider token claims and owner administration journeys still require
  deployment-specific validation before a hosted production promotion is accepted.
- Identity providers, email delivery, domains, secrets, and first-owner authority
  remain deployment-owner responsibilities.

## [0.69.0] - 2026-07-30

### Added

- Tenant-aware authorization boundaries with explicit owner, administrator, and
  learner enforcement.
- Versioned release-governance contracts for platform, content, migration,
  compatibility, checksum, and provenance artifacts.
- A credential-independent release rehearsal covering local publication, integrity
  verification, consumption, rollback, and cleanup.

### Changed

- Browser OIDC callbacks can recover safely after an expired browser transaction
  without weakening nonce, state, PKCE, or recent-authentication checks.
- PostgreSQL profile and learner-export timestamps use portable database semantics.

### Security

- Release workflows use immutable action references, least job permissions, Sigstore
  keyless signing, GitHub artifact attestations, and a validation-only manual path.

### Known limitations

- The self-host compatibility level remains `evaluation`.
- Identity-provider configuration and real user journeys remain deployment-owner
  responsibilities.

[0.71.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.71.0
[0.70.2]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.2
[0.70.1]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.1
[0.70.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.0
[0.69.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.69.0

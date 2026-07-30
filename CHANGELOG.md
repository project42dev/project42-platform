# Changelog

All notable reusable platform changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and released versions use
semantic versioning.

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

[0.70.2]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.2
[0.70.1]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.1
[0.70.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.0
[0.69.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.69.0

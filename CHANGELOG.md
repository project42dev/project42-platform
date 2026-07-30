# Changelog

All notable reusable platform changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and released versions use
semantic versioning.

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

[0.69.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.69.0

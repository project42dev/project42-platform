# Handoff

## Active branch

`fix/admin-cursor-hardening-ab6358`

## Completed

- Replaced readable, publicly forgeable administration cursors with
  AES-256-GCM encrypted and authenticated cursors.
- Derived the cursor key with HKDF from the existing
  `SESSION_ENCRYPTION_KEY` using a distinct purpose boundary.
- Preserved installation, query-kind, and account-state-filter binding and the
  existing generic stale/invalid cursor response.
- Passed the stable deployment key through hosted Worker and secure self-host
  repository construction. The local evaluation profile retains a
  process-scoped ephemeral key.
- Added deterministic coverage for opacity, alteration, cross-installation,
  wrong-kind, filter mismatch, wrong-key use, stable key derivation, malformed
  key material, and rejection of the legacy public-digest format.

## Verification

- `npx tsc -p tsconfig.json` — passed.
- `node --test tests/admin-pagination.test.mjs` — 5 passed.
- Focused account-service and D1 scale run — 7 passed, 1 optional PostgreSQL
  integration test skipped.
- `node --test tests/*.test.mjs` — 301 passed, 5 optional integration tests
  skipped.
- `npm run api:check` — Worker type generation and dry-run deployment passed.
- `npm audit --audit-level=high` — zero vulnerabilities.
- `git diff origin/main..HEAD --check` — passed.

## Remaining

- The branch has not been pushed and no pull request or external system was
  changed.
- `GET /v1/admin/deletions` remains unbounded. Learn currently consumes one
  unpaged `requests` array and has no deletion continuation control, so a safe
  fix requires a coordinated Platform and Learn contract rather than a silent
  server-side cap.
- AB#6358 still requires released production validation with a real owner
  session across at least two account pages and two audit pages.

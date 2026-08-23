# Project 42 quality records

This private directory holds cross-repository quality plans, redacted evidence, and
release gates that must not become runtime dependencies.

## Accessibility

- [Source and rendered accessibility audit](accessibility-audit-2026-07-23.md)
- [AB#5194 manual validation plan](accessibility/ab5194-manual-validation-plan.md)
- [AB#5194 redacted release-report template](accessibility/templates/ab5194-redacted-release-report.md)
- [AB#5194 accessibility Bug template](accessibility/templates/ab5194-accessibility-bug.md)

The AB#5194 package distinguishes deterministic preflight evidence from human
keyboard, assistive-technology, and moderated-usability evidence. A passing preflight
is never a substitute for the required human sessions.

## Operational readiness

- [AB#5196 foundation evidence](../releases/operational-readiness-ab5196-foundation.md)
- [AB#5196 scheduled-review candidate](../releases/operational-readiness-scheduled-review-ab5196.md)
- [Operational signal-review runbook](../runbooks/project42-operational-signal-review.md)
- [Incident-response runbook](../runbooks/project42-incident-response.md)
- [Operational game-day runbook](../runbooks/project42-operational-game-day.md)

The AB#5196 package supplies privacy-safe contracts, deterministic fixtures, a
read-only public preflight, offline alert-condition tests, and a six-hour
least-privilege observation workflow candidate with retained aggregate evidence.
It does not claim that private-signal collection, real alert delivery, a
production restore, or a game day has occurred.

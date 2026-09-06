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

**Nothing in this section is written yet. Verified 2026-09-05.**

This section previously linked to two AB#5196 release records and three
runbooks — operational signal review, incident response, and an operational
game day. **None of those five documents exist** in this repository, and the links have been removed rather than left to look like a
standing body of work.

The paragraph that stood here claimed the AB#5196 package supplies
privacy-safe contracts, deterministic fixtures, a read-only public preflight,
offline alert-condition tests and a least-privilege observation workflow. **No
such code is in this repository.** `scripts/`, `tests/`, `src/` and
`.github/workflows/` contain no preflight, no alert-condition test, no
observation workflow, and no incident or game-day procedure.

The runbooks have deliberately **not** been written here. A runbook that
invents a procedure nobody runs is worse than an acknowledged gap: it would be
read as evidence that operational readiness exists. When signal collection,
alerting and a restore procedure are actually built, the runbooks describing
them belong in `docs/runbooks/` and should be linked back from here.

# Project 42 quality records

This directory holds cross-repository quality plans, redacted evidence, and
release gates that must not become runtime dependencies. Some of the work it
describes is carried out with the owner's private operator tooling; where that
is so, the tooling is named by its repository-qualified path and what it checks
is stated here, so an adopter can build an equivalent.

## Accessibility

- [Source and rendered accessibility audit](accessibility-audit-2026-07-23.md)
- [AB#5194 manual validation plan](accessibility/ab5194-manual-validation-plan.md)
- [AB#5194 redacted release-report template](accessibility/templates/ab5194-redacted-release-report.md)
- [AB#5194 accessibility Bug template](accessibility/templates/ab5194-accessibility-bug.md)

The AB#5194 package distinguishes deterministic preflight evidence from human
keyboard, assistive-technology, and moderated-usability evidence. A passing preflight
is never a substitute for the required human sessions.

## The definition of done

The six acceptance criteria that decide whether the product is finished, what
observation proves each one in production, and what has previously been
mistaken for that proof: [definition-of-done.md](../definition-of-done.md).
Its status blocks are dated and are honest about which criteria currently fail.

## Operational readiness

**Verified 2026-09-06.** This date covers the three signal runbooks below, not
the acceptance criteria — see the definition of done for those.

- [Operational signal-review runbook](../runbooks/project42-operational-signal-review.md)
- [Incident-response runbook](../runbooks/project42-incident-response.md)
- [Operational game-day runbook](../runbooks/project42-operational-game-day.md)

Those three runbooks are the public procedure: the seven operational signals and
their passing conditions, the five alert classes and thresholds, the privacy
boundary on operational evidence, SEV1 to SEV4 severity and roles, the recovery
objectives, and the gates a game day must pass. They are written for an adopter
running their own deployment, not only for this project's owner.

The **tooling that automates them is operator tooling**, in the private
operations repository. The runbooks name it by path and state what it checks and
what a pass or a failure means, so an adopter can build an equivalent; nobody
outside the owner can run it.

| Artifact | Status |
|---|---|
| `project42dev-ops/deployment/Invoke-Project42OperationalPreflight.ps1` | Exists, in the private operations repository. Read-only public HTTPS probe with a deterministic-fixture mode |
| `project42dev-ops/deployment/Invoke-Project42OperationalAlertTests.ps1` | Exists, in the private operations repository. Deterministic offline alert-condition suite, no network and no delivery |
| `project42dev-ops/deployment/Invoke-Project42ScheduledOperationalReview.ps1` | Exists, in the private operations repository. Orchestrates the probe and the alert suite into three schema-valid aggregate artifacts |
| `project42dev-ops/deployment/Test-Project42OperationalReadiness.ps1` | Exists, in the private operations repository. Deterministic gate over the contract, the schemas and the source-level safety guarantees |
| `project42dev-ops/deployment/operational-readiness/` | Exists, in the private operations repository. Signal and alert manifests, strict schemas for the private summary, the report, the alert result, the scheduled-review result and the game-day result, plus fixtures |

Two earlier release records and a game-day record are the owner's private
release evidence and are **not** republished here. They are:

| Record | Status |
|---|---|
| `project42dev-ops/pmo/releases/operational-readiness-ab5196-foundation.md` | Exists, in the private operations repository. Records the contract, schemas and deterministic validation, and states plainly that the foundation is not operational acceptance |
| `project42dev-ops/pmo/releases/operational-readiness-scheduled-review-ab5196.md` | Exists, in the private operations repository. Records the scheduled least-privilege public observation and its retained aggregate evidence |
| `project42dev-ops/pmo/releases/operational-readiness-game-day-ab5196.md` | Exists, in the private operations repository. Records a non-destructive evidence-replay game day and its postmortem |

Those records contain measured figures and provider configuration state for one
specific hosted deployment. Publishing them would say nothing useful to an
adopter and would disclose the owner's operational detail, so they stay
operator-only and are cited rather than copied.

### What is not claimed

The operational package supplies contracts, deterministic fixtures, a read-only
public probe, offline alert-condition tests, and a scheduled least-privilege
public observation. It does **not** claim that private-signal collection is
configured, that a real external alert has been delivered, that a production
restore has been performed, or that an isolated live game day with fault
injection has been run. The game-day evidence that exists is a non-destructive
evidence replay, which explicitly retains its untested-delivery limitation.

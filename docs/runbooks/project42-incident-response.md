# Runbook: incident response

**Purpose:** run an incident affecting a Project 42 deployment — the public
sites, the identity and session service, learner-record writes, scheduled
maintenance, backups, or content-update jobs — with defined severity, ownership,
containment, recovery, communication, evidence and follow-up, and without
putting learner content or identifiers into logs, tickets, chat or release
records.

**Frequency:** as needed. Rehearse at least quarterly with the
[operational game day](project42-operational-game-day.md).

**Applies to:** any deployment of this platform, self-hosted or hosted.

**Verified:** 2026-09-06.

## What this page is, and what it is not

This is a **procedure**, not a claim. It defines how an incident is run. It does
not assert that any incident has occurred, that any deployment has an on-call
rota, or that a production restore has ever been performed.

The only tooling this procedure depends on is the **read-only public preflight**
used for triage, which is operator tooling:
`project42dev-ops/deployment/Invoke-Project42OperationalPreflight.ps1` in the
private operations repository. An adopter must provide their own equivalent — a
read-only probe of their own public endpoints that records aggregate status,
latency and error counts and **nothing else**. Every other step here is a human
decision that any operator can perform.

Release-specific rollback commands deliberately do **not** appear on this page.
They belong to the deployment procedure for the release you are rolling back,
and inferring one from a general runbook is how outages get worse.

## Severity

| Severity | Observable impact | Initial response | Update cadence |
|---|---|---|---|
| SEV1 | All public learning or account access is unavailable, learner-record loss is confirmed, or a broad security compromise is active | Immediate | Every 15 minutes |
| SEV2 | Authentication, durable writes, owner administration, backup and recovery, or a major surface is materially unavailable for many users | Within 15 minutes | Every 30 minutes |
| SEV3 | Bounded degradation with a safe workaround; one job or secondary surface is failing | Within 1 hour | Every 60 minutes |
| SEV4 | Low-impact defect, stale non-critical evidence, or a cosmetic operational issue | Next business day | Daily until dispositioned |

**If impact or data integrity is unknown, start at the higher reasonable
severity** and downgrade only once evidence supports it.

## Roles

Assign roles in the private incident record. One person may hold several for
SEV3 and SEV4; for SEV1 and SEV2 the incident commander and the evidence
recorder should be different people whenever staffing allows.

| Role | Responsibility |
|---|---|
| Incident commander | Owns severity, priorities, decisions, handoffs, and the resolution declaration |
| Operations responder | Diagnoses and executes approved containment and recovery steps |
| Communications lead | Publishes factual internal and external updates at the required cadence |
| Evidence recorder | Maintains the UTC timeline, commands run, aggregate results, approvals and rationale |
| Security and privacy lead | Controls the evidence boundary and leads any identity, secret or data-exposure response |
| Recovery lead | Verifies backup, restore target, transcript rebuild, tombstone replay, RPO and RTO evidence |

A single-operator deployment still needs these as a checklist, even when one
person holds every role.

## Prerequisites

- [ ] A private incident record with a non-identifying incident ID.
- [ ] An incident commander and an evidence recorder.
- [ ] The exact deployed release facts and the deployment inventory.
- [ ] The deployment and rollback procedure for the affected release.
- [ ] The recovery contract and the latest valid backup and restore evidence —
      see [learning-record recovery](../learning-record-recovery.md).
- [ ] Explicit owner authorization before **any** production mutation,
      credential rotation, traffic change, restore, or destructive containment.

## Procedure

### Step 1 — triage without learner data

Run the read-only public preflight against the deployment's own public endpoints
and record only:

- the UTC timestamp and the incident ID;
- the affected surface and route identifier;
- aggregate status, error counts, latency and failed-job counts;
- the exact release version and migration head;
- the alert class and alert-policy version; and
- the decision, the approving role, and the next update time.

Do **not** record learner or owner identifiers, email addresses, issuer and
subject pairs, claims, tokens, cookies, request or response bodies, assessment
content, profile data, raw logs, database rows, resource identifiers, database
or bucket names, or private filesystem paths.

**Expected result:** the affected signal and surface are bounded well enough to
assign a severity and a lead.

**If it fails:** hold or raise the severity. Do not broaden data collection to
compensate. Escalate to the provider console or an approved aggregate log view
under the same privacy boundary.

### Step 2 — declare severity and roles

The incident commander records, in the private incident record: the
non-identifying incident ID, the current severity, the status, an
aggregate-only impact statement, the assigned roles, and the next update time in
UTC.

**Expected result:** one commander, one current severity, one factual impact
statement, one cadence.

**If it fails:** the release owner becomes interim commander until a handoff is
recorded.

### Step 3 — contain by alert class

| Alert class | Safe first containment | Prohibited without separate approval |
|---|---|---|
| Failed authentication | Stop identity configuration changes; preserve the current discovery, issuer and callback state; verify public health and that unauthenticated access is still denied | Re-registering applications, changing the tenant or user flow, rotating credentials, or bypassing approval |
| Record-write failure | Freeze risky learner-data writes and release promotion using the documented application control; preserve append-only evidence and deletion receipts | Editing rows, replaying requests by hand, deleting failed records, or creating a second database |
| Scheduled-maintenance failure | Stop the maintenance sequence; preserve the pre-change release and the recovery bookmark; use the documented change-rollback decision | Continuing later steps after a failed gate, or adopting migrations without checksums |
| Backup stale or failed | Freeze data-changing releases; verify the last known valid backup metadata and that its storage is reachable | Claiming a backup exists from a timestamp alone, copying production data into a repository, or restoring over production |
| Content-update-job failure | Stop publication and draft promotion; preserve source and evaluation evidence; retain the human publication gate | Publishing generated content, changing facts without provenance, or routing around independent verification |

**Expected result:** user harm or integrity risk is bounded **without destroying
evidence**.

**If it fails:** raise the severity and request the next explicit owner decision.

### Step 4 — diagnose and choose a recovery path

Choose exactly one, and record the choice and its authority before executing:

1. no mutation; continue observing;
2. roll back the affected release;
3. disable the affected job or integration;
4. restore into an approved isolated target for verification only; or
5. production recovery under a separately approved change.

Any recovery claim requires **all** of:

- backup verification before the first restore write;
- checksum-bound schema and migration evidence;
- a complete projection and transcript rebuild;
- replay of deletion tombstones recorded after the backup;
- confirmation that the deleted stream remains empty;
- a measured RPO within the 24-hour objective;
- a measured RTO within the 8-hour objective; and
- a rollback path if recovery does not pass.

**If it fails:** do not restore and do not mutate production. Keep the service
contained and escalate.

### Step 5 — communicate factually

Internal updates carry: status (investigating, identified, monitoring,
resolved), severity, aggregate impact, verified facts only, completed actions,
the next action, and the next update time in UTC.

An approved public update names the capability affected, says work is under way,
states that no learner-specific information is included, and gives the time of
the next update. Never speculate about cause, never promise an unmeasured
recovery time, and never expose internal systems, provider identifiers,
accounts, or learner data.

### Step 6 — verify recovery and resolve

- [ ] Public health passes on every relevant endpoint.
- [ ] Authentication and authorization boundaries behave as expected.
- [ ] Record writes are idempotent and projections reconcile.
- [ ] Backup and restore evidence meets the required gates.
- [ ] Transcript rebuild and deletion-tombstone replay pass.
- [ ] RPO and RTO are measured and within objectives, where recovery was run.
- [ ] Failed jobs are cleared, or explicitly deferred with a named owner.
- [ ] Source monitoring and content publication gates are healthy.
- [ ] Monitoring stays stable across at least two normal alert windows.
- [ ] The incident commander declares resolution and records the final update.

### Step 7 — follow up

Within two business days for SEV1 and SEV2, five for SEV3: write a blameless
summary and impact statement; reconstruct the UTC timeline; run an
evidence-based five-whys; record what worked and what did not; raise a tracked
item for every corrective action with an owner, a priority and a due date;
update the runbooks, alert thresholds or recovery tooling that failed you; and
record the acceptance decision.

## Verification

- [ ] Severity and roles were explicit.
- [ ] Containment and recovery authority were recorded before execution.
- [ ] Communications met the cadence and contained only verified facts.
- [ ] The evidence contains no learner content and no identifier.
- [ ] Resolution rests on objective signal or recovery proof.
- [ ] Every follow-up action has an owner, a priority and a due date.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Responders conflict or changes collide | No single incident commander | Stop changes and reaffirm the commander |
| Raw logs were copied into the incident record | The evidence boundary was not followed | Restrict access, remove the unsafe copies through approved retention handling, and record a privacy incident |
| A restore passed row counts but not transcript or tombstone gates | A narrow infrastructure check was used as broad recovery proof | Run the full projection and deletion recovery contract in an isolated target |
| Updates contain estimates without evidence | Communication pressure | Replace with verified status and the next update time |
| The incident is resolved but alerts recur | The monitoring window was too short, or the root cause persists | Reopen, restore the prior severity, and continue mitigation |

## Rollback

Use the exact release-specific rollback from the deployment procedure for the
release in question. **Never infer a rollback command from this page.** Preserve
the database unless a separately authorized, tested recovery plan says
otherwise.

## Escalation

| Situation | Route to |
|---|---|
| SEV1, SEV2, or uncertain destructive impact | Owner and incident commander, immediately |
| Identity, secret or privacy concern | Security and privacy lead; stop unsafe evidence collection first |
| Restore, transcript, tombstone, RPO or RTO failure | Recovery lead; freeze promotion |
| Provider-wide outage | Provider support, plus a factual public update |
| Content integrity or factuality incident | Content operations and the publication approver; stop publication |

## Related

- [Operational signal review](project42-operational-signal-review.md)
- [Operational game day](project42-operational-game-day.md)
- [Learning-record recovery](../learning-record-recovery.md)
- [Learner data policy](../learner-data-policy.md)

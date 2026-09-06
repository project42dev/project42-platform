# Runbook: operational game day

**Purpose:** rehearse one realistic operational incident end to end, without
production learner content or identifiers, to prove that the team can detect,
declare, contain, communicate, recover, roll back, preserve deletion, rebuild
transcripts, measure recovery objectives, and raise follow-up work.

**Frequency:** quarterly, and before any material change to the recovery
architecture.

**Applies to:** any deployment of this platform, self-hosted or hosted.

**Verified:** 2026-09-06.

## What this page is, and what it is not

This page is the **exercise design and its acceptance gates**. It is public
because an adopter cannot claim operational readiness without running something
like it.

It does **not** claim that a game day has been run against any particular
deployment. A game day is only evidence when a schema-valid result exists with
recorded approval, execution timestamps, and measurements. The result contract
and the validator that rejects a passing claim with no execution behind it are
operator tooling in the private operations repository, under
`project42dev-ops/deployment/operational-readiness/`, exercised by
`project42dev-ops/deployment/Test-Project42OperationalReadiness.ps1`. **An
adopter must provide their own equivalent**: a result record that cannot be
marked passed without approval, timestamps and measured RPO and RTO.

## Two modes

| Mode | What it is | What it can prove |
|---|---|---|
| Isolated live exercise | A synthetic fault is injected into a disposable, provably isolated environment | Detection through the configured alerting path, containment, rollback, restore, rebuild, replay, and measured recovery — including external alert delivery |
| Non-destructive evidence replay | Retained privacy-safe observation and recovery evidence is replayed, and the incident procedure is rehearsed as a tabletop | Alert-condition detection, incident procedure, backup, isolated restore, rollback, transcript rebuild, tombstone replay, RPO and RTO |

An evidence replay must record an explicitly authorized no-production-mutation
scope, must mark alert detection from the deterministic condition tests rather
than from a delivered alert, and must retain the limitation that **external
alert delivery was not tested**. It is a valid non-destructive game day. It is
**not** a substitute for a later isolated live exercise, and it can never be
used to claim that the delivery channel works.

## Prerequisites

- [ ] The owner approves the exact scope, date, participants, target, and any
      production mutation, in a private change record.
- [ ] The target is an isolated disposable environment. Production is excluded
      unless separately and explicitly authorized.
- [ ] Incident commander, operations responder, communications lead, evidence
      recorder, security and privacy lead, and recovery lead are assigned.
- [ ] The exact released source, migration checksums, deployment procedure and
      last verified backup are identified.
- [ ] Recovery tooling is current and its deterministic tests pass.
- [ ] A **synthetic** dataset exists containing attempts, scores, transcript
      projections, mastery evidence, and a deletion tombstone recorded after the
      backup. It contains no production learner data.
- [ ] The result is written outside every Git repository and worktree until a
      privacy review approves a sanitized record.
- [ ] Stop conditions and rollback authority are acknowledged by everyone taking
      part.

## Scenario rotation

Pick one primary alert class per exercise and inject only synthetic conditions:
failed authentication, record-write failure, scheduled-maintenance failure,
stale or failed backup, or content-update-job failure.

**At least once a year, choose record-write or backup failure**, so the complete
recovery path is exercised. Never simulate success by editing the result.

## Stop conditions

Stop immediately if:

- production learner content or an identifier appears;
- a credential, token, cookie, resource identifier or raw log would be recorded;
- a production mutation lacks exact owner authorization;
- the target cannot be proven isolated;
- backup integrity is unknown before the first restore write;
- the deletion tombstone is unavailable;
- the rollback path is unavailable; or
- a participant cannot tell exercise traffic from production traffic.

Record the exercise as aborted, preserve the sanitized evidence, and open
corrective work.

## Procedure

### Step 1 — validate the foundation

Run the offline validation of the operational contract, as in the
[signal-review runbook](project42-operational-signal-review.md). **If it fails,
cancel the game day** and fix the foundation first.

### Step 2 — record authorization and a baseline

Record the non-identifying exercise ID, the approved target, release versions,
recovery objectives, roles, scenario, start window, stop conditions and rollback
decision. Do not record account, learner, tenant, application, database, bucket
or owner identifiers.

Then capture a privacy-safe baseline with the public preflight, so any
pre-existing warning is known before injection. **If the baseline fails, do not
inject.**

### Step 3 — inject the approved synthetic condition

Use the isolated-environment mechanism named in the change record. Do not touch
production DNS, identity applications, secrets, databases, object storage,
hosting or alert routing unless that exact mutation is separately authorized.

Start the detection clock at injection. The evidence recorder writes UTC events
only.

**Expected result:** the intended signal crosses its threshold, and no unrelated
signal or real user is affected.

**If it fails:** stop the injection, restore the baseline, and record the
scenario as failed or aborted.

### Step 4 — detect, declare, communicate

Follow the [incident-response runbook](project42-incident-response.md):
classify the severity, assign roles, record detection and acknowledgement times,
publish the first factual internal update, set the cadence, and record
containment decisions and their authority.

**Expected result:** the condition is recognized through the configured
operational path — **not because the facilitator announced it**.

**If it fails:** mark alert detection and delivery as failed. Continue only if
the incident commander explicitly converts the exercise into a manual-response
test.

### Step 5 — contain and roll back

Execute the documented containment and rollback for the affected release, in the
isolated target. Verify the previous release or the disabled job is healthy
before continuing. **If it fails:** stop and preserve the target for diagnosis.

### Step 6 — verify the backup before restoring

Record only aggregate evidence: the backup contract version and checksum status,
evidence completeness, the backup timestamp, the synthetic event watermark, and
the restore-target classification.

**Expected result:** integrity and completeness pass **before the first restore
write**. **If it fails: do not restore.**

### Step 7 — restore into the approved isolated target

Use the exact released migrations and the documented recovery procedure. A
restore must either complete atomically or clean up its interrupted partial
state. **If it fails:** exercise rollback and cleanup, record the failure, stop.

### Step 8 — rebuild and reconcile

Using synthetic records only, verify: enrollments and module completion;
assessment attempts, scores, corrections and retained history; transcript
rebuild; badge and mastery projection rebuild; replay of the post-backup
deletion tombstone; that the deleted stream remains empty; and that digests and
aggregate counts match the expected synthetic state.

**If any of these fails, the game day cannot pass** — regardless of row counts
or schema checks.

### Step 9 — measure RPO and RTO

Record the measured RPO in seconds from the synthetic recovery point against the
**24-hour objective**, and the measured RTO in seconds around the *complete*
restore, rebuild and replay operation against the **8-hour objective**. Both
measurements must be present and within objective. **If not:** record the
failure and raise corrective work.

### Step 10 — recover, monitor, close

Re-run the operational report, confirm two normal alert windows, publish the
final exercise update, and have the incident commander set the outcome to
passed, failed, or aborted. Validate the sanitized result against the result
contract.

A passing result must contain approval, execution timestamps, passed alert
detection, passed incident and recovery gates, measured RPO and RTO, and a
mode-specific alert-delivery decision. An evidence replay must preserve its
untested-delivery limitation. **A result that does not validate is not
evidence.**

### Step 11 — postmortem

Within two business days: reconstruct the UTC timeline; complete a blameless
five-whys; record what worked and what failed; raise a tracked corrective item
for each finding with an owner, priority and due date; update the runbooks,
thresholds, recovery tooling or training; and attach only a sanitized,
schema-valid result to the readiness record.

## Verification checklist

- [ ] Approval, exercise mode and target isolation were recorded.
- [ ] One of the five alert classes was injected synthetically.
- [ ] Alert-condition detection passed.
- [ ] External alert delivery passed for an isolated live exercise, or remained
      explicitly not evaluated for an evidence replay.
- [ ] Severity, roles, containment, communications and the evidence timeline
      passed.
- [ ] Rollback passed.
- [ ] Backup integrity passed before the restore.
- [ ] The restore passed in the approved target.
- [ ] Transcript rebuild passed.
- [ ] Deletion-tombstone replay passed and deleted evidence stayed absent.
- [ ] Measured RPO was within the 24-hour objective.
- [ ] Measured RTO was within the 8-hour objective.
- [ ] No learner content or identifier was read or recorded.
- [ ] The postmortem and corrective work exist.
- [ ] The final result validates against the result contract.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The alert was visible only because the facilitator said so | The delivery path was never exercised | Fail the detection gate; configure and test routing under a later approved change |
| Restore row counts pass but the transcript differs | Projection rebuild or event ordering failed | Fail the exercise and investigate the recovery semantics |
| A deleted synthetic learner reappears | The tombstone was not replayed after the backup | Stop; treat as a critical recovery defect |
| RTO omits rebuild and replay time | The measurement window is too narrow | Re-measure around the complete recovery operation |
| The result has passing fields but no approval or timestamps | The exercise was not actually executed | Keep it as not executed; never backfill evidence |

## Rollback

The exact rollback comes from the deployment procedure for the release under
test. Restore the isolated target to its baseline, or dispose of it through the
approved change record. **Never delete or overwrite production from this
runbook.**

## Escalation

| Situation | Route to |
|---|---|
| Production was affected unexpectedly | Owner and incident commander; convert immediately to a real incident |
| Learner content or an identifier appeared | Security and privacy lead; stop and restrict the evidence |
| Tombstone replay failed | Recovery lead and owner; treat as a critical integrity failure |
| An RPO or RTO objective failed | Release owner and recovery lead; block acceptance |
| The exercise cannot be isolated | Owner; cancel and redesign before rescheduling |

## Related

- [Operational signal review](project42-operational-signal-review.md)
- [Incident response](project42-incident-response.md)
- [Learning-record recovery](../learning-record-recovery.md)

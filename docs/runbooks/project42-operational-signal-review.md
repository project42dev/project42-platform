# Runbook: operational signal review

**Purpose:** produce a privacy-safe operational report for a running Project 42
deployment, covering availability, error rate, latency, failed jobs,
source-monitor freshness, backup age, and restore-test age — without collecting
learner content or identifiers.

**Frequency:** on a schedule, after every production release, and during incidents.

**Applies to:** any deployment of this platform, self-hosted or hosted.

**Verified:** 2026-09-06.

## What this page is, and what it is not

This page is the **procedure and the contract**: the signals, their passing
conditions, the privacy boundary, and the order in which the checks are run. It
is public because an adopter needs it to operate their own deployment.

The **tooling that automates the procedure is operator tooling**. It lives in
the private operations repository as
`project42dev-ops/deployment/Invoke-Project42OperationalPreflight.ps1`,
`project42dev-ops/deployment/Invoke-Project42OperationalAlertTests.ps1` and
`project42dev-ops/deployment/Invoke-Project42ScheduledOperationalReview.ps1`,
with its manifests, schemas and fixtures under
`project42dev-ops/deployment/operational-readiness/`. A public contributor
cannot run those scripts. **An adopter must provide their own equivalent**, and
this page states exactly what that equivalent has to check.

Nothing here claims that any particular deployment is currently healthy, that
private-signal collection is configured, or that an external alert has ever been
delivered.

## The signal contract

Seven signals. Three come from unauthenticated public probes; four come from a
sanitized private summary that the operator generates from their own provider
evidence.

| Signal | Source | Reported value | Passing condition |
|---|---|---|---|
| Availability | Public probe | Successful probes divided by the number of allowlisted endpoints | `1.0` |
| Error rate | Public probe | Failed probes divided by the number of allowlisted endpoints | `0.0` |
| Latency p95 | Public probe | Nearest-rank p95 across the current probes | Every endpoint within its declared budget |
| Failed jobs | Private summary | Aggregate failed-job count | `0` |
| Source-monitor age | Private summary | Hours since the last successful source-monitor run | Passed evidence, no older than 24 hours |
| Backup age | Private summary | Hours since the last successful backup | Passed evidence, no older than 24 hours |
| Restore-test age | Private summary | Hours since the last successful restore test | No older than 720 hours, with transcript rebuild, deletion-tombstone replay, RPO and RTO gates all passed |

Five configuration expectations are reported alongside the signals: worker
observability, worker logs, alert routing, a scheduled monitor, and a backup
schedule. Each is reported as configured, not configured, or unknown.

An aggregate storage summary may also be carried — database bytes and table
count, private-media object and byte totals. Storage is deliberately **not** an
eighth health signal, because no capacity threshold has been approved.

The report is a point-in-time sample, not a service-level promise. The recovery
objectives it is measured against are a **24-hour RPO** and an **8-hour RTO**.

### The rule that makes the report honest

**A missing signal is unavailable or unknown. It is never a pass.** A healthy
public-only run is a warning, not a pass, because failed jobs, backup age,
restore-test age and configuration state cannot be inferred from a handful of
HTTP responses. Any equivalent an adopter builds must fail closed the same way;
a monitor that reports green when it has no evidence is worse than no monitor.

## Public probes

The public half of the review sends **unauthenticated GET requests only**, to a
fixed allowlist of the deployment's own public HTTPS hosts declared in a
versioned manifest. No credentials, cookies, query strings, unlisted hosts or
redirects off the allowlist are permitted, and the probe has no mutation path.

Each endpoint declares an expected status code and a latency budget. For this
project's own deployment the allowlist covers the portal at
`https://project-42.dev` and its API host; an adopter's allowlist is their own
hosts. If a deployment's hostnames change, the manifest must change with them —
an allowlist that still names a hostname the deployment has retired will fail
closed on every run. That is correct behaviour, but it is a manifest defect
rather than an outage, and it should be read as one.

## Privacy boundary

The private summary is an **aggregate** document. It must be stored at an
absolute path outside every Git repository and worktree, and it must never
contain:

- a learner, user, account, subject or tenant identifier, an email address or a
  display name;
- an authorization header, cookie, access token or refresh token;
- a request body, response body or query string;
- a resource, database or bucket identifier or name; or
- raw log material or a private filesystem path.

The generated report carries fixed endpoint and signal identifiers, numeric
aggregates, timestamps, enumerated statuses, declared limitations, and privacy
assertions — nothing else. Operator tooling enforces this by validating every
input and output against a strict schema that rejects undeclared properties, and
by recursively scanning strings for secret and identifier patterns. **That scan
is a guardrail, not a substitute for review**: remove a prohibited field at its
source, never by redacting the rendered report.

## Alert conditions

Five alert classes are exercised **offline**, against fixtures, with no network,
destination, credential or delivery integration. Each class is tested twice —
once at its baseline, once one step past its threshold — for ten cases in total.

| Alert class | Signal | Fires when |
|---|---|---|
| Failed authentication | Failure count | More than 2 |
| Record-write failure | Failure count | More than 0 |
| Scheduled-maintenance failure | Failure count | More than 0 |
| Backup stale or failed | Age in hours | More than 24 |
| Content-update-job failure | Failure count | More than 0 |

Passing the offline suite proves the **conditions** are correct. It proves
nothing about **delivery** — that a real destination receives, routes and
acknowledges an alert is separate evidence, and this project does not claim it.

## Procedure

### Step 1 — validate the contract offline

Run the deterministic validation before anything touches the network. It checks
the manifests, every schema, the complete and the missing-private-summary report
paths, rejection of prohibited hosts and identity fields, all ten alert cases,
and the source-level guarantees that the probe only issues GET requests and that
the alert harness makes no network call at all.

*Operator tooling:* `project42dev-ops/deployment/Test-Project42OperationalReadiness.ps1`.
*Adopter equivalent:* a test that fails if any schema, threshold or fixture has
drifted from the contract above.

**If it fails:** stop. Do not run a live probe against a contract you have not
validated.

### Step 2 — probe the public endpoints without private evidence

Run the review in its live-public mode, writing its output into a private
evidence root. Expect every allowlisted endpoint to return its declared status
within its latency budget, and expect the four private signals to be reported
unavailable. Overall status will be a warning; that is correct.

**If it fails:** confirm DNS and public HTTPS reachability independently. Do not
add authorization, cookies or alternate hosts to make a probe succeed. A
reproducible failure is an incident — classify it with the
[incident-response runbook](project42-incident-response.md).

### Step 3 — validate the sanitized private summary

Validate the operator-generated aggregate summary against its schema before
using it. **If it fails:** regenerate the summary. Never weaken the schema, add
free-text notes, or paste raw provider output into it.

### Step 4 — produce the complete report

Re-run the review with the validated private summary supplied and private
evidence required. A pass means the public probes, the supplied aggregate
evidence, the freshness objectives, the configuration expectations and the
offline alert contract all passed.

**If it fails:** treat a failure as an operational condition needing triage, and
a warning as missing evidence that must be reconciled before any release gate
can pass. Supplying evidence that contains a failed signal makes the run fail
*after* it writes its result, so the evidence survives the failure.

### Step 5 — exercise the alert conditions offline

Expect all ten cases to pass, with delivery-attempted and network-used both
false. **If it fails:** stop promotion and fix the condition contract before
configuring any real destination.

## Verification

- [ ] Offline validation passed from a clean checkout.
- [ ] The report validates against its schema.
- [ ] All seven signal identifiers appear exactly once, and all five
      configuration expectations appear exactly once.
- [ ] Every missing signal reads unavailable or unknown, never passed.
- [ ] The report contains no URL, private path, identifier, raw body or
      free-text log material.
- [ ] All five alert classes and ten cases passed offline.
- [ ] A public endpoint or signal failure fails the scheduled job *after* its
      aggregate evidence is written.
- [ ] Real alert routing and delivery are tracked as separate evidence and are
      not inferred from the offline suite.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| An endpoint returns no status | DNS, TLS, timeout, or a real public failure | Confirm the URL independently; begin incident triage if reproducible |
| An endpoint fails consistently for a host you no longer serve | The manifest allowlist names a hostname the deployment has retired | Update the manifest to the deployment's current public hosts |
| A private signal is unavailable | No sanitized summary, or no successful timestamp in it | Generate a schema-valid aggregate summary from approved private evidence |
| Restore age fails despite a recent timestamp | A transcript, tombstone, RPO or RTO gate did not pass | Complete the recovery gate; do not edit the timestamp |
| Configuration reads unknown | No verified aggregate provider state was supplied | Inspect provider configuration read-only and regenerate the summary |
| Privacy validation rejects the input | A prohibited field or a secret pattern is present | Remove it at the source |
| A healthy run is still a warning | No private summary was supplied | Correct. Treat the observation as valid but incomplete |

## Rollback

Nothing in this procedure changes production. If a report is wrong, mark it
superseded in the private evidence index and regenerate it from the last
reviewed contract. Never edit an accepted result in place.

## Escalation

| Situation | Route to |
|---|---|
| Availability, write or authentication failure at SEV1 or SEV2 | Incident commander, immediately |
| Possible learner-data or identity disclosure | Security and privacy lead; stop collection first |
| Backup or restore objective failure | Recovery lead; freeze risky writes and releases |
| Source-monitor or content-update failure | Content operations owner; hold publication |
| Unknown configuration before a release | Release owner; block the release |

## Related

- [Incident response](project42-incident-response.md)
- [Operational game day](project42-operational-game-day.md)
- [Learning-record recovery](../learning-record-recovery.md)

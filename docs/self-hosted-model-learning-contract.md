# Self-hosted model operations learning contract

Status: implementation contract for AB#6161. This document defines the public,
provider-neutral outcome before individual modules and labs are authored.

## Outcome

A learner completes the path by deploying a model endpoint from an identified,
permitted, immutable artifact; evaluating it on representative cases; measuring
load and capacity; observing it through logs, metrics, traces, and alerts; applying
a controlled update; completing a rollback; and handing off an incident and
recovery runbook with reproducible evidence.

Starting an endpoint is not sufficient. Completion requires evidence that another
reviewer can inspect without access to Project 42 infrastructure.

## Audience and prerequisites

The path serves practitioners who understand AI Foundations and basic operating
system, network, container, and command-line concepts. It does not assume a
particular model family, accelerator vendor, serving runtime, cloud, or orchestration
platform.

Learners must complete the AI Foundations path and its mastery checks before this
path. The self-managed agent path may depend on this path's endpoint, identity,
telemetry, evaluation, and recovery contracts.

## Progressive module sequence

1. **Choose a deployment ownership model** — compare managed APIs, managed
   compute, and self-managed infrastructure using data, staffing, latency,
   reliability, portability, and total-cost evidence.
2. **Establish model identity, licensing, and provenance** — identify the artifact,
   revision, publisher, license obligations, use restrictions, origin, and review
   decision.
3. **Create an immutable model artifact** — verify digests and signatures where
   available, record configuration and dependencies, scan the package, and retain
   a compatibility manifest.
4. **Plan hardware, runtime, and capacity** — measure rather than assume memory,
   storage, accelerator, throughput, latency, concurrency, and quantization
   tradeoffs.
5. **Select serving and API compatibility** — define request, response, streaming,
   model-identity, error, timeout, health, and readiness behavior independently of
   one runtime.
6. **Deploy a bounded endpoint** — implement workstation, container/on-premises,
   edge, or cloud-managed deployment with explicit prerequisites and stop
   conditions.
7. **Secure identity, secrets, network, and access** — enforce identity, scoped
   authorization, approved secret sources, network exposure, rate limits, audit,
   and abuse controls outside the model.
8. **Evaluate the model and complete system** — run representative, boundary,
   missing-data, privacy-sensitive, safety, and adversarial-like cases against
   documented pass criteria.
9. **Observe cost, capacity, and performance** — collect logs, metrics, traces,
   resource use, latency distributions, throughput, queueing, error, and cost
   evidence with privacy-aware telemetry.
10. **Scale and design for failure** — test saturation, backpressure, timeouts,
    retry safety, load distribution, dependency failure, and recovery objectives.
11. **Update, roll back, and recover** — preview compatibility, back up required
    state, stage an update, verify it, trigger a safe failure, roll back, and record
    incident evidence.
12. **Self-hosted model operations capstone** — submit the complete evidence
    package and demonstrate deployment, evaluation, load, monitoring, update,
    rollback, and runbook execution.

The public catalog path ID will be `self-hosted-model-operations`. Its badge will
require the capstone evidence and every prerequisite check, not attendance alone.

## Deployment shapes

Every module distinguishes portable requirements from implementation choices:

| Shape | Required learning evidence |
|---|---|
| Workstation | Local authority, artifact storage, resource limits, process lifecycle, endpoint exposure, and recovery |
| Container or on-premises | Immutable image/configuration, host and accelerator requirements, persistent evidence, network policy, health, backup, and rollback |
| Edge | Offline or constrained operation, artifact distribution, device identity, limited telemetry, staged update, and physical recovery |
| Cloud-managed compute | Identity, private/public exposure, quotas, scaling, cost evidence, service lifecycle, exportability, and provider failure boundaries |

No shape is presented as universally cheaper, safer, faster, or easier. Learners
must measure the workload and document organizational operating capability.

## Portable lab package

Every executable lab validates against
`schemas/training/self-hosted-model-lab.schema.json`. The contract records:

- exact model artifact identity, revision, license review, provenance, digest,
  optional signature verification, dependency manifest, and scan evidence;
- deployment shape and reproducible hardware/runtime configuration;
- endpoint protocol, API behavior, health, readiness, identity, authorization,
  secret source, and network boundary;
- evaluation cases, metrics, thresholds, results, and unresolved failures;
- load profile, resource measurements, capacity result, and stop condition;
- privacy-conscious logs, metrics, traces, alert evidence, and retention boundary;
- staged update, compatibility decision, backup, rollback, and recovery evidence;
- portable concepts, adapter-specific steps, and at least one alternative
  implementation mapping;
- exact evidence paths and SHA-256 digests; and
- human approvals and draft/approved state.

Paths are repository-relative. Public examples use placeholders and local reference
addresses. Secrets, tokens, personal data, tenant identifiers, subscription or
account identifiers, private resource names, and production learner records are
prohibited.

## Homestead Foundry boundary

Homestead Foundry may provide an optional reference adapter and executable lab. It
must satisfy the same artifact, endpoint, identity, telemetry, evaluation, update,
rollback, and recovery contract as any other implementation.

Foundry-specific commands, deployment aliases, and operating assumptions stay in a
separate adapter section. The portable outcome, evidence fields, checks, and
assessment rubric cannot depend on Foundry. Public packages contain no private
Foundry inventory or Project 42 deployment information.

## Mastery evidence

The capstone requires:

1. an approved artifact and license/provenance decision;
2. a reproducible endpoint and health/readiness proof;
3. representative quality and safety evaluation results;
4. load, latency, capacity, and resource evidence;
5. privacy-reviewed logs, metrics, traces, and an alert;
6. an update preview and compatibility result;
7. a completed rollback with restored service evidence; and
8. an incident/recovery runbook with owner, triggers, stop conditions, escalation,
   recovery objectives, and post-incident actions.

Knowledge checks and labs remain draft until their sources, factual content,
accessibility, and assessment validity receive the required human approvals.

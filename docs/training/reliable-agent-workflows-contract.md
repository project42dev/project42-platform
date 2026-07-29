# Reliable Agent Workflows delivery contract

The Reliable Agent Workflows path teaches one accountable operating method, not
one provider SDK or agent framework. A learner moves from a bounded work order to
typed tools, governed context and memory, explicit protocol and trust boundaries,
measured orchestration choices, evaluation, observability, incident recovery, and
a human-reviewed capstone.

The machine-readable source is
`content/training/reliable-agent-workflows/path-contract.json`. It validates
against `schemas/training/learning-path-contract.schema.json`.

## What the contract controls

The contract fixes the module order and the evidence that each module must leave
behind. It also defines nine system boundaries:

1. Identity and authorization remain in trusted application and identity systems.
2. Tool execution remains in a validating, authorizing, auditable executor.
3. Durable workflow state remains outside the model and survives restart.
4. Memory has separate consent, provenance, correction, retention, and deletion.
5. Orchestration owns budgets, cancellation, approvals, and terminal outcomes.
6. Evaluation owns representative cases, holdouts, rubrics, and release gates.
7. Observability correlates events without treating sensitive content as telemetry.
8. Recovery reconciles uncertain effects before retry, rollback, or compensation.
9. People retain authority over scope, consequential action, assessment, exception,
   and publication decisions.

The model may propose actions and generate content. It does not authenticate a
principal, grant permission, prove a side effect, approve its own release, or
convert an unknown outcome into success.

## Required comparison

Learners run equivalent cases through a deterministic workflow, a bounded
single-agent design, and a bounded multi-agent design. They compare outcome
quality, critical safety, latency, cost, coordination overhead, tool trajectory,
recovery, and human review load. The release decision selects the least complex
design that passes critical gates and meets declared operating requirements.

This prevents a multi-agent demonstration from being presented as an improvement
merely because it uses more agents.

## Evidence and mastery

Every module produces a retained artifact. The capstone collects at least:

- the bounded work order and success contract;
- an identity and authority map;
- typed tool and side-effect contracts;
- state and memory lifecycle evidence;
- an orchestration and handoff decision;
- evaluation results with critical slices;
- privacy-conscious telemetry evidence;
- an incident and recovery runbook;
- equivalent-case single-agent and multi-agent results; and
- an accountable human release disposition.

A knowledge score of 80 percent is necessary but is not sufficient. Every critical
criterion must pass, and a person must review the applied evidence.

## Class-ready and publication gates

Each substantive module must receive complete narration, demonstrations,
exercises, checks, corrective feedback, assessment handoffs, captions,
transcripts, text-only equivalents, and reduced-motion alternatives. Generated
content stays draft until editorial, subject-matter, accessibility, safety, and
publication approvals are recorded.

Current provider, protocol, runtime, security, price, lifecycle, and evaluation
claims require dated primary sources and a maximum 90-day review cadence. The
contract forbids automatic publication of unreviewed generated content.

## Portable lab boundary

The path uses the reusable agent-lab schema at
`schemas/training/self-hosted-agent-lab.schema.json`. The portable contract covers
inputs, outputs, identity, tools, state, telemetry, evaluation, and recovery.
Provider- or runtime-specific steps belong in adapters and must not change the
portable evidence contract.

The reference lab must preserve truthful terminal outcomes, including failed and
unknown. It must test injected observations, unauthorized resources, duplicate
side effects, timeouts after possible writes, poisoned tool output, exhausted
budgets, stale state, and lost handoffs.

## Executable reference lab

The no-secret reference implementation is in
`examples/training/bounded-agent-lab/`. Run it from the package root:

```text
npm run lab:agent
```

It executes the same ten synthetic cases against the deterministic, single-agent,
and multi-agent designs. The complete JSON result validates against
`schemas/training/bounded-agent-lab-evidence.schema.json`. The committed reference
summary records exact quality, critical-safety, logical-latency, cost,
coordination, recovery, tool-trajectory, and human-review measurements.

The reference runner uses deterministic model fixtures, an in-memory lab-only
journal, logical ticks, and zero network calls. Its evidence is reproducible
contract and control evidence, not live-provider quality evidence. A local,
open-weight, cloud-provider, or optional Homestead Foundry model adapter must
preserve the same cases, gates, state, authorization, reconciliation, telemetry,
and comparison contract. Deployment identifiers and private runtime evidence stay
outside the public package.

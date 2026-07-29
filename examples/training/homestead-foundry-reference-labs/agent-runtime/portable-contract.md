# Portable agent runtime lab contract

## Mission

Operate a bounded agent through routine, denied, failed, unknown-outcome, restart,
and recovery cases while keeping model access, tools, state, memory, telemetry,
evaluation, and human authority explicit.

## Inputs and outputs

Inputs are schema-valid cases with declared data classes, intended outcome,
allowed tools, deadlines, and prohibited effects. Outputs use one of three
terminal states: `succeeded`, `failed`, or `unknown`. Each output cites the run,
runtime, model adapter, tool journal, state checkpoint, evaluation, and recovery
evidence required to reproduce the disposition.

## Identity and tools

Treat the caller, operator, agent workload, model endpoint, and every tool as
separate principals and resources. The agent receives only the authority required
for the current case. Tool calls have allowlisted targets and arguments, bounded
deadlines and retries, explicit `success`, `failure`, or `unknown` results, and an
idempotency or reconciliation strategy.

Prompt text and model output never grant authority. An unknown outcome is not a
failure that can be retried blindly. Reconcile the target or side-effect journal
before deciding whether to resume, compensate, stop, or ask an authorized human.

## State and memory

Version the run-state schema and record transitions, checkpoints, idempotency keys,
tool results, approvals, and terminal disposition. Define what short-term context
and durable memory may contain, who can read or delete it, retention, expiry, and
how stale or corrupt state is detected. Restart from a verified checkpoint and
prove the agent does not duplicate an external effect.

## Evaluation and recovery

Evaluate task outcome, authorization, prohibited effects, unknown-outcome
reconciliation, state consistency, memory policy, telemetry coverage, cost or loop
limits, coordination overhead, and recovery objectives. Run equivalent cases
through deterministic, single-agent, and multi-agent designs. Force one tool
timeout after a possible side effect, interrupt the runtime, restart it, reconcile
the effect, and reach a verified terminal state without duplication.

Stop on identity ambiguity, unauthorized tool access, prohibited data or effect,
unbounded loop or retry, corrupt state, unreconciled unknown outcome, telemetry
disclosure, or failed recovery. Consequential release and incident decisions
remain with authorized humans.

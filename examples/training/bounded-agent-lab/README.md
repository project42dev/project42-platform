# Portable bounded-agent comparison lab

This executable, provider-neutral lab runs the same ten synthetic cases against
three control designs:

1. a deterministic workflow;
2. a bounded single-agent controller; and
3. a bounded multi-agent controller with versioned handoffs.

The lab measures outcome quality, critical safety, logical latency, cost units,
coordination overhead, recovery, tool trajectory, and human-review load. It uses
no credentials, network calls, production data, external side effects, or paid
model calls.

## Run the lab

From the package root with Node.js 22 or later:

```text
npm run lab:agent
```

The command writes a complete JSON evidence bundle to standard output. It does
not create or modify an external resource. The evidence validates against
`schemas/training/bounded-agent-lab-evidence.schema.json`.

The committed `evidence/reference-summary.json` records the expected
deterministic reference result. Automated tests execute the lab, validate its
full evidence bundle, and compare the measured summary with that record.

## What executes

The runtime exercises:

- typed, allowlisted lab-only tool behavior;
- separate caller, workload, and operator authority assumptions;
- state-version checks and deterministic terminal outcomes;
- durable operation keys and duplicate-effect prevention;
- an unknown tool result after a possible write;
- reconciliation before any retry;
- step and model-call cost budgets;
- privacy-safe causal trace events;
- a durable multi-agent handoff and lost-delivery recovery; and
- equivalent cases across all three designs.

The case set includes the required adversarial and failure conditions:

- prompt-injected observation;
- unauthorized resource;
- duplicate side effect;
- timeout after a possible write;
- poisoned tool output;
- budget exhaustion;
- stale state version; and
- lost multi-agent handoff.

## How to interpret the reference result

All designs preserve critical safety, reconcile unknown outcomes, and avoid
unauthorized or duplicate effects. The deterministic workflow safely escalates a
case that requires semantic classification, so it does not meet every outcome
requirement. The single-agent and multi-agent designs both pass the equivalent
case set. The single-agent design is selected because it uses fewer logical
ticks, cost units, and coordination events while producing the same measured
quality, safety, trajectory, and recovery result.

This is a bounded fixture result, not a claim that one design is universally
better. Replace or extend the cases, budgets, graders, and release thresholds for
the actual mission. Keep the same cases and critical gates when comparing
designs.

## Model and runtime adapters

The executable core uses deterministic model fixtures so anyone can run it
offline. A real adapter may call an authorized local model, open-weight serving
endpoint, cloud provider, or Homestead Foundry deployment, but it must preserve:

- the same case and evidence contracts;
- application-owned identity, authorization, state, budgets, and terminal
  outcomes;
- tool postconditions and reconciliation;
- privacy-conscious telemetry;
- comparable usage, latency, coordination, and recovery measurements; and
- human release authority.

The optional Homestead Foundry mapping remains in
`examples/training/homestead-foundry-reference-labs/agent-runtime/`. It supplies
only the model endpoint. It does not replace this runtime, tool policy, durable
state, evidence contract, or human approval.

## Evidence status

The committed result is deterministic reference evidence. It is not live provider
or Homestead Foundry execution evidence and it is not publication approval. Live
adapter results must record exact runtime and model identities privately when
those values identify a deployment, replace the reference summary through a
reviewed evidence package, and obtain subject-matter, accessibility, safety,
lab-execution, and publication approval.

# Optional Homestead Foundry reference labs

These two draft labs prove the same portable outcomes through two different
runtime shapes:

| Lab | Portable outcome | Optional Homestead Foundry adapter |
|---|---|---|
| Model service | Qualify an exact model endpoint, access boundary, evaluation, capacity, telemetry, update, rollback, and recovery contract | Use a privately selected deployment through Homestead Foundry's published OpenAI-compatible v1 interface |
| Agent runtime | Qualify bounded inputs and outputs, separate caller/operator/workload identity, allowlisted tools, durable state and memory policy, telemetry, evaluation, and recovery | Run the portable agent loop outside Foundry and use a privately selected Homestead Foundry model deployment as its model adapter |

Homestead Foundry is optional. Neither Project 42 nor a clone needs it at learner
runtime. An organization can replace it with another OpenAI-compatible model
service, a local model server, or another governed inference adapter while keeping
the same evidence contract.

## Status

The schemas, example packages, portable instructions, adapter mappings, negative
fixtures, and deterministic tests are draft implementation evidence. They are not
live-execution evidence. The examples contain no real endpoint, deployment, tenant,
subscription, model credential, learner record, or private resource identifier.

Before publication, an authorized operator must:

1. Copy the draft package into a private lab workspace.
2. Resolve placeholders from that organization's approved inventory.
3. Review model license, provenance, data, identity, tool, state, telemetry, cost,
   and recovery boundaries.
4. Execute routine and failed-path cases through the selected adapter.
5. Replace illustrative evidence digests with digests of the real evidence.
6. Record the `lab-execution` approval plus editorial, subject-matter,
   accessibility, and safety approvals.
7. Keep the public package provider-neutral and redact private operational facts.

## Required separation

The `portable-contract.md` files state what must be proven. The
`homestead-foundry-adapter.md` files state how the optional reference maps those
outcomes to Homestead Foundry's published interface. The `alternative-runtime.md`
files show how a different implementation can satisfy the same contract.

Do not place adapter commands, resource names, endpoints, identities, or
credentials in the portable contract. Do not treat a successful response as proof
of identity, authorization, capacity, observability, rollback, or recovery.

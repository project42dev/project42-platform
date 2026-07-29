# Homestead Foundry agent runtime adapter

This lab uses Homestead Foundry only as the model endpoint behind a portable agent
runtime. The agent loop, tools, state, memory, telemetry, evaluation, and recovery
remain outside Foundry and follow the public contract.

This is the safest current mapping because Homestead Foundry's public guidance
supports bringing your own runtime to its OpenAI-compatible v1 endpoint, while its
agent-tool gateway is a governed future phase rather than a prerequisite. The lab
does not create a Foundry prompt agent, hosted agent, tool gateway, or persistent
cloud resource.

## Adapter mapping

| Portable requirement | Homestead Foundry mapping |
|---|---|
| Model adapter | Privately selected deployed reasoning entry resolved through the registry contract |
| Runtime identity | The learner's local or self-hosted agent runtime manifest |
| Caller and workload authority | Private identity and policy mapped outside the public package |
| Tool contract | Local allowlisted fixtures with no irreversible effect |
| State and memory | Local schema, checkpoint, retention, and reconciliation records |
| Telemetry | Local run, tool, state, outcome, and recovery correlation plus available model-call metrics |
| Evaluation | Portable cases and graders tied to the exact runtime and deployment mapping |
| Recovery | Restart from a verified checkpoint, reconcile unknown effects, and verify the terminal state |

## Execution sequence

1. Resolve an authorized deployed reasoning entry in the private workspace.
2. Bind the model adapter through environment or workload identity without
   exposing the endpoint or credential in the public package.
3. Start the portable runtime on loopback with a three-tool fixture set: one
   deterministic read, one idempotent write to a lab-only journal, and one
   controlled timeout that returns an unknown result.
4. Execute routine, denied, failed, timeout, restart, reconciliation, and recovery
   cases with hard turn, token, request, time, retry, and cost ceilings.
5. Verify state transitions, memory policy, tool authority, terminal status,
   telemetry, and absence of duplicate effects.
6. Replace illustrative evidence digests and obtain the required human approvals.

The model may propose a tool call or explanation. Only the runtime policy and
authorized human boundary can permit a consequential action.

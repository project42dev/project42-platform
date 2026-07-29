# Homestead Foundry model service adapter

This optional adapter maps the portable model-service contract to Homestead
Foundry's published Azure AI Foundry interface. It is not part of the portable
contract and must remain replaceable.

## Published interface used

Homestead Foundry documents an OpenAI-compatible v1 base URL, with the selected
deployment name supplied as the request's `model` value. Its public model-registry
schema provides stable IDs, provider, deployment-name mapping, region, status,
access gating, capabilities, notes, and evidence references. A consumer must fail
closed when a registry entry is not marked deployed.

Use Microsoft Entra workload or user identity when the private deployment permits
it. If a lab environment must use a key, keep it in the approved private secret
boundary. Never copy it into the lab package, shell history, prompt, transcript,
evidence, or repository.

## Adapter mapping

| Portable requirement | Homestead Foundry mapping |
|---|---|
| Exact model identity | Privately resolved registry entry plus deployment inventory, model version, runtime configuration, and evidence digest |
| Endpoint contract | OpenAI-compatible v1 chat subset declared by the lab |
| Health and readiness | Management-plane deployment state plus a bounded inference smoke; the published interface does not promise separate portable health routes |
| Caller authority | Entra role or approved secret mapped to the declared caller principal |
| Network boundary | The private environment's approved Foundry endpoint and network policy |
| Evaluation | Project 42 cases executed against the exact selected deployment |
| Capacity and cost | Measured request distribution, throttling, latency, quota, and dated cost evidence |
| Telemetry | Available Azure monitoring evidence plus the caller's own correlation and outcome records |
| Update and rollback | Complete baseline and candidate deployment mappings with explicit traffic and postcondition evidence |

## Execution sequence

1. In the private workspace, copy the public registry schema and select a deployed
   reasoning entry that is authorized for the lab.
2. Record the stable registry ID separately from the deployment name. Keep the
   endpoint, account, project, region, and identity private.
3. Verify the caller can retrieve deployment state and make one bounded smoke
   request. Record response identity and routing evidence without prompt content.
4. Run the portable evaluation and load cases with hard request, token, time,
   retry, and cost ceilings.
5. Force the declared failed gate and restore the known-good mapping.
6. Write secret-free evidence, replace illustrative digests, and request human
   review.

Do not create a persistent agent, tool gateway, model deployment, or Azure
resource for this lab without a separately approved infrastructure change.

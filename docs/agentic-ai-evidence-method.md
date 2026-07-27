# Agentic-AI classification evidence method

Project 42 classifies an exact product experience, not a provider logo or model
family. The current documentation snapshot is
`content/reference/agentic-ai-product-evidence.json`; its public contract is
`schemas/agentic-ai-product-evidence.schema.json`.

## Classification question

Ask what the named experience does in the observed version and configuration:

1. Is it only a model mapping supplied input to generated output?
2. Is the person directing each conversational or work step?
3. Is the executable path fixed in code?
4. Can a model choose the next permitted step from feedback?
5. Which runtime validates and executes tools?
6. Where do identity, authority, state, budgets, telemetry, and recovery live?
7. Are separately controlled agents coordinating through explicit handoffs?
8. Which human remains accountable for approval and consequential outcomes?

A model that emits a tool-call proposal is still a model. An agent requires a
running, bounded loop around it. An agentic system includes that agent plus the
tools, state, policy, identity, evaluation, recovery, and human-control surfaces
needed to operate it.

## Evidence labels

- `documented` means a current first-party source directly describes the named
  behavior or contract.
- `tested` means a controlled test of the exact product, version, configuration,
  and permissions produced retained evidence. The current matrix is explicitly
  documentation-only and makes no tested claims.
- `inference` is a conclusion derived from cited documented boundaries. It must
  not be presented as a vendor statement.
- `unknown` preserves a gap that the available documentation or tests do not
  resolve.

Marketing terms such as assistant, copilot, agentic, autonomous, or multi-agent
are discovery clues, not proof. The matrix records the observable signals,
boundary notes, and unknowns supporting each classification.

## Product and model separation

Provider families contain different layers. A consumer chat product, an API
model, a tool-use protocol, a coding agent, an agent framework, and a managed
agent service can legitimately receive different classifications even when they
share a provider or model name.

The matrix includes current cases for Anthropic, OpenAI, Microsoft, Google, xAI,
Moonshot/Kimi, DeepSeek, and open-weight systems. These are teaching cases rather
than permanent rankings. They intentionally show both model-only and agentic
experiences where first-party evidence supports the distinction.

## Freshness and publication

Every source and product case has a generic editorial owner, observation date,
and review-by date no later than 90 days after verification. Review sooner after
a product rename, model or runtime release, permission change, incident, or
material documentation revision.

Before publication:

1. re-open every first-party source;
2. confirm the exact product surface and terminology still exist;
3. downgrade unsupported statements to `unknown`;
4. keep documentation evidence separate from controlled-test evidence;
5. run schema, source-registry, privacy, and semantic tests; and
6. obtain the required human editorial, subject-matter, accessibility, safety,
   and publication approvals.

No model or automated maintenance process can approve its own classification for
publication.

# Kilo Code

> Enterprise-focused VS Code extension forked from Cline, with team management and self-hosted model support.

**Category:** coding agent in VS Code
**Cost model:** free community edition; enterprise pricing varies (verify current pricing)
**Last verified:** 2026-04-28

---

## What it is

Kilo Code is a VS Code extension descended from Cline (formerly Claude Dev), maintained with an enterprise focus. It adds features on top of the Cline base: team-level configuration management, support for self-hosted and on-premises model deployments, compliance-oriented audit logging, and centralized API key management. Like Cline, it supports BYOM across Anthropic, OpenAI, Azure, Bedrock, Vertex, and compatible local endpoints.

## Where it shines

- Enterprise teams that need centralized control over which models agents use
- Organizations with compliance requirements that require audit logs of AI-generated changes
- Shops running self-hosted or on-premises LLMs who want a VS Code agent that can reach them
- Teams that have already standardized on Cline workflows but need the enterprise control plane

## Where it falls down

- Enterprise-tier pricing and configuration adds overhead for small teams or individuals
- Less active open-source community than the upstream Cline project
- Feature additions sometimes lag behind Cline's community releases
- Still VS Code only; no JetBrains support

## When to reach for it

When your organization's security or compliance team requires control over model selection, data residency, and an audit trail of AI coding actions.

## When NOT to reach for it

For individual developers or small teams where the overhead of enterprise configuration outweighs the benefits. Use Cline directly instead.

## Cost notes

Community edition is free; you pay your model provider per token. Enterprise licensing is separate — contact Kilo Code for current pricing. Centralized API key management means the organization, not individual developers, controls and pays the model provider bills.

## Setup pointer

Install "Kilo Code" from the VS Code Marketplace. Enterprise configuration is managed via a shared settings JSON that admins distribute to the team. See their docs for the enterprise setup walkthrough.

## Links

- Official site: https://kilocode.ai
- Docs: https://kilocode.ai/docs
- GitHub: https://github.com/Kilo-Org/kilocode

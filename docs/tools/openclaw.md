# OpenClaw

> Personal-agent runtime by Peter Steinberger that orchestrates coding agents across messaging surfaces (WhatsApp, Telegram, Slack, Discord).

**Category:** orchestrator / personal-agent runtime
**Cost model:** not publicly priced; personal/private project (verify availability)
**Last verified:** 2026-04-28

---

## What it is

OpenClaw is a personal-agent runtime created by Peter Steinberger (co-founder of PSPDFKit / Nutrient). It is not a coding agent itself — it is an orchestrator that delegates coding tasks to agents like Claude Code or its own "Pi" coding agent. Its defining feature is multi-surface accessibility: you interact with it via WhatsApp, Telegram, Slack, or Discord rather than a terminal or IDE. OpenClaw manages the lifecycle of coding sessions, routes tasks to the appropriate agent, and surfaces results back through the messaging interface you used to invoke it.

## Where it shines

- Developers who want to kick off and monitor coding tasks from a mobile device or messaging app
- Scenarios where you are away from a workstation but want to queue or check on agentic coding work
- Teams that already coordinate in Slack or Discord and want to trigger coding agents without opening a terminal
- Workflows where a human-in-the-loop approval step needs to happen through a chat surface

## Where it falls down

- Not a publicly available SaaS product as of April 2026; access is limited and availability may change
- Adding a messaging-layer orchestrator introduces latency and debugging complexity compared to running an agent directly
- Dependent on the underlying agent (Pi or Claude Code) for actual coding quality; OpenClaw adds routing, not intelligence
- Less documentation and community support than any of the primary coding agents

## When to reach for it

When you specifically need to interact with a coding agent through a messaging app rather than a terminal, and you have access to the OpenClaw runtime.

## When NOT to reach for it

When you are at a workstation and can run Claude Code or another terminal agent directly. The messaging-surface abstraction adds friction that isn't worth it in a standard desktop development workflow.

## Cost notes

Not publicly priced. Underlying agent costs (e.g., Anthropic API usage by Claude Code or Pi) still apply. Verify current access model directly with the project.

## Setup pointer

OpenClaw is not available via a public package registry as of April 2026. Follow Peter Steinberger on social channels for access announcements and setup instructions.

## Links

- Project author: https://twitter.com/steipete (Peter Steinberger)
- (No stable public docs URL as of April 2026 — verify current state before referencing)

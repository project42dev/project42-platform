# Roo Code

> VS Code extension forked from Cline, adding specialized agent modes and expanded autonomous capabilities.

**Category:** coding agent in VS Code
**Cost model:** free extension; you pay your own model provider per token (BYOM)
**Last verified:** 2026-04-28

---

## What it is

Roo Code (formerly Roo Cline) is an open-source VS Code extension forked from Cline that adds additional agent "modes" on top of the base Cline feature set. Modes include Code (standard coding agent), Architect (high-level planning and design), Ask (Q&A without file writes), and Debug (focused on diagnosing and fixing errors). Each mode has a configurable system prompt and model selection, so teams can route different task types to different models. It retains full BYOM support across the same providers as Cline.

## Where it shines

- Teams that want to route planning, coding, and debugging tasks to different models within the same session
- Developers who want a "safe" Ask mode that cannot write files — useful for exploratory Q&A
- Architect mode for generating implementation plans before committing to code changes
- Power users who want to customize per-mode system prompts without forking the extension themselves

## Where it falls down

- Forked from Cline, so it inherits Cline's VS Code-only limitation
- Multiple modes add configuration surface area; simpler setups can stay with vanilla Cline
- Smaller community than upstream Cline; some bug fixes land in Cline first
- The naming history (Roo Cline → Roo Code) causes confusion in search results and docs

## When to reach for it

When you want different behavior (and optionally different models) for planning versus coding versus debugging, all within VS Code, without setting up separate tools.

## When NOT to reach for it

When you don't need specialized modes and the base Cline experience already satisfies your workflow. Roo Code's extra surface area is only worth it if you use the modes.

## Cost notes

Free extension. Token cost is identical to Cline — you pay your configured model provider per token. Routing planning tasks to a cheaper or smaller model (e.g., Haiku for Architect mode) can meaningfully reduce costs compared to using Sonnet or Opus for everything.

## Setup pointer

Install "Roo Code" from the VS Code Marketplace. Configure providers and per-mode model assignments in the Roo Code settings panel. System prompts for each mode are editable under Advanced Settings.

## Links

- Official site: https://roocode.com
- GitHub: https://github.com/RooVetGit/Roo-Code
- Docs: https://docs.roocode.com

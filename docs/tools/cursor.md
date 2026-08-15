# Cursor

> AI-first IDE built as a fork of VS Code, with deep model integration baked into the editor itself.

**Category:** coding agent in IDE
**Cost model:** free tier (limited); Pro $20/mo; Business $40/user/mo (verify current pricing)
**Last verified:** 2026-04-28

---

## What it is

Cursor is a standalone IDE forked from VS Code that embeds AI at the editor level rather than through an extension. It supports inline completions, a chat panel, a Composer/Agent mode that can edit multiple files, and terminal integration. It ships its own model routing layer and lets users bring their own API keys or use Cursor's hosted model credits.

## Where it shines

- Developers who want autocomplete, chat, and multi-file agent mode in one surface without juggling extensions
- Composer/Agent mode for coordinated edits across several files with a single instruction
- Teams that want a managed AI IDE without configuring model providers themselves
- Codebase-wide Q&A via the `@codebase` context reference

## Where it falls down

- Forked from VS Code, so it lags VS Code releases and some extensions behave inconsistently
- Model credits on the Pro plan are capped; heavy users hit limits and face overage costs
- Less transparent about which model is active at any given moment compared to BYOM setups
- No native JetBrains support; JetBrains users need a different tool

## When to reach for it

When you want the tightest possible IDE + AI integration without leaving a VS Code-like environment, and you don't want to wire up MCP servers or configure extensions yourself.

## When NOT to reach for it

When you need precise control over which model runs each request, or when your team standardizes on JetBrains IDEs.

## Cost notes

The free tier offers a limited number of completions and slow requests per month. Pro ($20/mo) includes a monthly pool of fast model requests; requests beyond the cap are slower or billed as overages. Business adds centralized billing and SSO. Bring-your-own-API-key mode bypasses credits but you pay the upstream provider directly.

## Setup pointer

Download from https://cursor.com. On first launch, sign in and choose whether to use Cursor's hosted credits or your own API keys under Settings > Models.

## Links

- Official site: https://cursor.com
- Docs: https://docs.cursor.com

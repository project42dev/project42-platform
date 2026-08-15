# Windsurf

> AI-first IDE from Codeium, with a "Flow" agentic engine that acts proactively alongside the developer.

**Category:** coding agent in IDE
**Cost model:** free tier; Pro $15/mo; Team pricing available (verify current pricing)
**Last verified:** 2026-04-28

---

## What it is

Windsurf is a standalone IDE built by Codeium, distinct from VS Code (though visually similar). Its central concept is "Flows" — a mode where the AI agent observes your edits, terminal output, and linter errors in real time and proposes or makes changes proactively, without waiting to be explicitly prompted. It also includes a traditional chat panel and inline autocomplete. Windsurf uses Codeium's own hosted models as its default but supports additional providers.

## Where it shines

- Developers who want an agent that reacts to what they are doing rather than waiting for explicit prompts
- Flow mode is particularly effective for debugging loops: you run a failing test and the agent immediately suggests a fix
- Teams that want a Cursor alternative with a different pricing model or model lineup
- Codeium users who already have an account and want a deeper IDE integration than the VS Code extension

## Where it falls down

- Proactive Flow behavior can feel intrusive on tasks where you want to think without AI interruption
- Like Cursor, it is a forked/standalone IDE rather than a VS Code extension, creating compatibility friction with some extensions
- Model selection and transparency are more limited than BYOM tools
- Smaller ecosystem of guides and community patterns compared to Cursor

## When to reach for it

When you want an agent that proactively monitors your work and suggests fixes without you having to ask, particularly in test-fix-rerun loops.

## When NOT to reach for it

When you need full control over which model handles each request, or when your team's VS Code extension ecosystem is deeply customized.

## Cost notes

Free tier includes limited fast requests and autocomplete. Pro ($15/mo, verify current pricing) includes more fast requests and Flow usage. Overages are possible on heavy agentic sessions. Codeium's hosted model pricing is bundled into the subscription rather than billed per token.

## Setup pointer

Download from https://windsurf.com. Sign in with your Codeium account. The IDE works immediately; Flow mode is activated via the Cascade panel on the right side.

## Links

- Official site: https://windsurf.com
- Docs: https://docs.codeium.com/windsurf

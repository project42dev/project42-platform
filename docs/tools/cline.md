# Cline

> VS Code extension that runs an agentic coding loop with full bring-your-own-model support.

**Category:** coding agent in VS Code
**Cost model:** free extension; you pay your own model provider per token (BYOM)
**Last verified:** 2026-04-28

---

## What it is

Cline (formerly Claude Dev) is an open-source VS Code extension that gives VS Code a full agentic coding loop: it reads files, writes edits, runs terminal commands, and browses the web, all with explicit permission prompts before each action. It supports any model reachable via OpenAI-compatible API, the Anthropic API, AWS Bedrock, Google Vertex, Ollama, and others. The extension itself is free; cost comes entirely from your chosen model provider.

## Where it shines

- Teams that want to control exactly which model runs each task and pay the provider directly
- Projects where auditability matters — every file write and shell command is shown before execution
- Polyglot shops that need to switch between Claude, GPT-4o, Gemini, and local models depending on task
- Developers already in VS Code who don't want a second IDE

## Where it falls down

- No bundled model credits; you must have your own API keys configured before doing anything
- The explicit permission flow is thorough but slower than tools that act first and ask later
- Community-maintained; major VS Code API changes or provider API changes can break things briefly
- No JetBrains support (see Kilo Code or Continue for that)

## When to reach for it

When you want an agentic agent inside VS Code, you want full model choice, and you're comfortable managing API keys and understanding per-token costs.

## When NOT to reach for it

When you want a zero-configuration out-of-the-box experience. Cline requires API key setup before it does anything useful.

## Cost notes

No subscription fee. Every task sends tokens to your chosen model API. Claude Sonnet via the Anthropic API is the most commonly used backend; a typical multi-file refactor task costs cents to low dollars depending on repo size and context sent. Large file reads in agentic loops are the main cost driver.

## Setup pointer

Install "Cline" from the VS Code Marketplace. On first launch, open the Cline panel and enter your API key under Provider Settings.

## Links

- Official site: https://cline.bot
- Docs: https://docs.cline.bot
- GitHub: https://github.com/cline/cline

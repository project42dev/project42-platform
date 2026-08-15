# OpenCode

> Open-source terminal coding agent with bring-your-own-model support and a TUI interface.

**Category:** coding agent in CLI
**Cost model:** free tool; you pay your own model provider per token (BYOM)
**Last verified:** 2026-04-28

---

## What it is

OpenCode is an open-source terminal coding agent built in Go, designed as a BYOM alternative to Claude Code and Codex CLI. It presents a terminal UI (TUI) with a chat-style interface, supports file reads and writes, shell command execution, and context management. It connects to any OpenAI-compatible API endpoint, the Anthropic API, and others, making it viable with local models via Ollama or LM Studio as well as cloud providers.

## Where it shines

- Developers who want a Claude Code-style terminal agent but without any subscription or vendor lock-in
- Air-gapped or local-model environments where all inference must stay on-premise
- Polyglot API users who want to test different providers against the same workflow
- Open-source contributors who want to extend or self-host the agent runtime

## Where it falls down

- Smaller community than Claude Code, Aider, or Cursor; fewer battle-tested guides and integrations
- Feature parity with Claude Code or Codex CLI is not always kept current
- No built-in git commit integration on par with Aider
- Stability and release cadence depends on a smaller maintainer team

## When to reach for it

When you need a self-hostable, provider-agnostic terminal agent and are willing to accept a less polished experience in exchange for full control.

## When NOT to reach for it

When reliability and community support matter more than open-source flexibility. Claude Code or Aider are better-supported choices for production team use.

## Cost notes

No tool cost. You pay whatever your chosen provider charges per token. Local model inference via Ollama or LM Studio has no per-token cost beyond hardware. Cloud providers bill normally.

## Setup pointer

See the GitHub releases page for the latest binary. Set your provider API key as an environment variable. Run `opencode` in your project directory and configure the provider in the TUI settings.

## Links

- GitHub: https://github.com/opencode-ai/opencode
- Docs: https://github.com/opencode-ai/opencode#readme

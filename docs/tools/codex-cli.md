# Codex CLI

> OpenAI's official terminal coding agent, running in a sandboxed environment with full shell access.

**Category:** coding agent in CLI
**Cost model:** API per-token (OpenAI API key required); no separate subscription
**Last verified:** 2026-04-28

---

## What it is

Codex CLI is OpenAI's open-source terminal agent. It accepts natural-language tasks, generates and executes shell commands and code edits inside a sandboxed environment (network-off, Docker or macOS Seatbelt by default), and iterates until the task is complete. It is model-agnostic within the OpenAI API family and defaults to the o3 or o4-mini reasoning models. Unlike chat-based tools, it is designed to run unattended on well-specified tasks.

## Where it shines

- Tasks that require many shell commands in sequence (build, test, lint, fix) where you want the agent to iterate autonomously
- Security-conscious environments where the network-isolated sandbox reduces blast radius
- Teams already paying for the OpenAI API who don't want a second vendor
- Scripted or CI-adjacent use where a headless terminal agent fits naturally

## Where it falls down

- Requires the OpenAI API; no native support for Anthropic, Gemini, or local models
- Sandbox restrictions can block tasks that need outbound network access (e.g., fetching a dependency)
- Newer than Claude Code and Aider; the ecosystem of guides and community patterns is smaller
- No IDE integration; terminal only

## When to reach for it

When you are in the OpenAI ecosystem, want a sandboxed autonomous agent for shell-heavy tasks, and don't need multi-provider model choice.

## When NOT to reach for it

When your primary model is Claude or Gemini, or when the task requires network access that the sandbox would block.

## Cost notes

All costs are OpenAI API per-token. Reasoning models (o3, o4-mini) are more expensive per token than GPT-4o but often complete tasks in fewer turns. Long agentic loops with large file reads are the main cost driver. (Verify current OpenAI API pricing at https://openai.com/api/pricing.)

## Setup pointer

Install via npm: `npm install -g @openai/codex`. Set `OPENAI_API_KEY`. Run `codex` in your project directory. Use `--approval-mode full-auto` for unattended runs.

## Links

- Official site: https://openai.com/codex
- GitHub: https://github.com/openai/codex
- Docs: https://github.com/openai/codex#readme

# Claude Code

> Anthropic's official CLI coding agent, running in your terminal and integrating with VS Code and JetBrains.

**Category:** coding agent in CLI
**Cost model:** included with Claude Pro ($20/mo) and Max ($100/mo); API per-token for direct API users
**Last verified:** 2026-04-28

---

## What it is

Claude Code is a terminal-based agentic coding assistant built and maintained by Anthropic. It operates in a persistent session, reads your codebase, writes and edits files, runs shell commands, and coordinates multi-step tasks autonomously. It ships as an npm package (`@anthropic-ai/claude-code`) and runs on macOS, Linux, and Windows (via WSL or native bash).

## Where it shines

- Large, multi-file refactors where the agent needs to hold broad context across the repo
- Tasks that require running tests, interpreting failures, and iterating — all in one session
- Teams using Claude Max who want zero per-token billing anxiety during long agentic runs
- Workflows that chain subagents, use MCP servers, or invoke custom hooks for automation

## Where it falls down

- No GUI; developers who want inline ghost-text autocomplete need a separate IDE integration
- Heavy agentic sessions on the API (non-subscription) can accumulate large token costs quickly
- Context window discipline matters: very large repos require careful scoping or compaction

## When to reach for it

When you need an agent to own a task end-to-end — write, test, debug, commit — without you babysitting each step. The sweet spot is tasks that would take 10–30 minutes of focused human effort.

## When NOT to reach for it

When you want fast, line-level autocomplete while typing. Use a VS Code extension (Cline, Continue, Copilot) for that interaction pattern.

## Cost notes

Pro and Max subscribers get Claude Code included; token usage draws from the same pool as chat. Max ($100/mo) is effectively unlimited for most agentic workloads. API users pay per input/output token — long agentic loops with large file reads can be expensive. Prompt caching reduces cost significantly for repeated context reads.

## Setup pointer

Install via npm: `npm install -g @anthropic-ai/claude-code`. Run `claude` in any project directory. Authenticate with your Anthropic account or `ANTHROPIC_API_KEY` environment variable.

## Links

- Official site: https://claude.ai/code
- Docs: https://docs.anthropic.com/en/docs/claude-code

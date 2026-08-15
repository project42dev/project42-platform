# Claude Family — Anthropic

**Last verified:** 2026-04-28
**Pricing note:** Verify current API pricing at [anthropic.com/pricing](https://www.anthropic.com/pricing) before relying on specific numbers. The figures below are reference points, not guarantees.

---

## Model overview

| Model | Context | Strengths | API ID | Primary use cases |
|---|---|---|---|---|
| **Opus 4.7** | 1M tokens | Complex reasoning, large codebases, multi-step agentic loops, architecture planning | `claude-opus-4-7` | System design, hard debugging, multi-file refactors, long-range planning, tasks where Sonnet fails after two well-formed attempts |
| **Sonnet 4.6** | 200K tokens | Balanced quality and cost, fast, reliable code generation and editing | `claude-sonnet-4-6` | Default for 90% of work: feature development, editing, documentation, YAML/Bicep/Terraform, runbooks |
| **Haiku 4.5** | 200K tokens | Cheapest, fastest; suitable for clear-rule tasks | `claude-haiku-4-5-20251001` | Classification, extraction, bulk transforms, log parsing, commit message generation, one-liners |

---

## Release notes (April 2026)

- **Opus 4.7** released April 16, 2026. Became the Claude Code default model on April 23, 2026.
- **Sonnet 4.6** is the workhorse mid-tier. Most interactive sessions and API calls should start here.
- **Haiku 4.5** is unchanged in role: high-volume, low-stakes, latency-sensitive tasks.

---

## Access paths

| Path | Who it's for | Billing | Notes |
|---|---|---|---|
| **Claude Pro** ($20/mo) | Light individual use via claude.ai | Flat fee | No API access; chat interface only |
| **Claude Max 5×** ($100/mo) | Heavy interactive use, Claude Code | Flat fee | Claude Code CLI + VS Code ext included; no per-token billing |
| **Claude Max 20×** ($200/mo) | Very heavy use, long agentic sessions | Flat fee | Higher usage cap than 5× |
| **Anthropic API** | Automation, CI/CD, SDK apps | Per-token | API key required; use for programmatic access, not interactive sessions |
| **Claude Code** | Agentic coding, subagents, MCP, hooks | Max plan or API key | Primary recommended path for development work |

**Rule of thumb:** Interactive daily work belongs on a Max plan. Automation and scripts belong on the API. Running API keys for interactive sessions at heavy use almost always costs more than a Max plan.

---

## Model escalation guidance

Start every task on **Sonnet 4.6**.

**Escalate to Opus 4.7** when:
- Sonnet gives a wrong or incomplete answer after two attempts with well-formed prompts.
- The task involves system design, architectural decisions, or multi-file refactor planning.
- The problem requires reading more than ~150K tokens of context.
- You have been debugging the same issue for more than 30 minutes.

**Drop to Haiku 4.5** when:
- The task is classification, extraction, or transformation with explicit rules.
- You are running the same operation more than 10 times in a batch.
- The prompt is under five lines and the expected answer is under two paragraphs.
- Latency matters more than output depth.

**Cap extended thinking tokens** (MAX_THINKING_TOKENS=8000) unless you specifically need deep reasoning on a hard problem and you are on Opus.

---

## Context window discipline

Opus 4.7's 1M-token context is an upper bound, not a target. Filling the context window is slow and expensive. Strategies to stay efficient:

- Send only the files the model needs to read or modify — not the entire repository.
- Use `/compact` in Claude Code to summarize conversation history before it bloats.
- When a task requires more context than Sonnet's 200K window, prefer forking a subagent with a scoped context over escalating to Opus unless reasoning depth is also needed.
- For document analysis tasks that are primarily retrieval (not synthesis), prefer a model with large context + a retrieval strategy over dumping everything in the prompt.

---

## When Claude is the wrong choice

| Situation | Better option |
|---|---|
| You need a reviewer for Claude-generated code | GPT-5.4 via Foundry or Gemini (cross-family rule) |
| Data must stay on Azure infrastructure | Azure AI Foundry models |
| Offline or data-residency-restricted environment | Open-weight local (Ollama, llama.cpp) |
| Inline autocomplete while typing in VS Code | GitHub Copilot with Claude model |
| You need OpenAI-native behavior or GPT-5.x specifically | Azure AI Foundry GPT-5.x |

---

## Related

- `docs/models/foundry-gpt5.md` — cross-family reviewer options
- `docs/decisions/model-routing.md` — worked examples
- `MODELS.md` — routing matrix and token budget defaults
- `decisions/model-routing.md` — escalation rules and cost comparison

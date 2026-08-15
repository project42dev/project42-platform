# Context Windows

> Date: 2026-04-28

---

## What a context window is

A context window is the maximum number of tokens a model can process in a single call. It is a hard limit on the sum of:

- The system prompt (memory files, agent instructions, tool schemas)
- Conversation history (every prior turn in the session)
- Tool call results (file contents read, command output, API responses)
- The model's own output (completion tokens)

When the total exceeds the limit, the model cannot process the full input. Some implementations truncate silently. Claude Code stops and prompts for compaction. Either way, something gets cut.

The context window is not a buffer you fill passively — it is a resource you manage actively.

---

## Per-model context limits

These figures are approximate. Verify against the provider's current documentation before depending on a specific limit. Date-stamped 2026-04-28.

### Anthropic Claude family

| Model | Context limit | Notes |
|---|---|---|
| Claude Opus 4.7 | ~1,000,000 tokens | Released 2026-04-16; Claude Code default from 2026-04-23 |
| Claude Sonnet 4.6 | ~200,000 tokens | Workhorse; most workstreams use this |
| Claude Haiku 4.5 | ~200,000 tokens | Speed and cost optimized; use for high-volume low-stakes tasks |

### OpenAI via Microsoft Azure AI Foundry

| Model | Context limit (approx.) | Notes |
|---|---|---|
| GPT-5.4 | ~128,000 tokens | Verify current limit — may have changed post-GA |
| GPT-5.4 mini | ~128,000 tokens | Approximate; confirm with Azure deployment |
| GPT-5.4 nano | ~32,000 tokens | Smallest in family; cheap, fast, context-constrained |
| GPT-5.5 | ~200,000+ tokens | Check current docs; improved long-context at GA |

These are approximations from public documentation. Azure Foundry phased rollouts mean specific deployment types (Standard vs Provisioned) may have different behavior. Always verify.

### Google Gemini

Gemini family models support very large context windows — multiple millions of tokens in some configurations. Gemini CLI is free. Use when long-context analysis exceeds Claude Opus 4.7's 1M limit.

### Open-weight (Ollama / local)

Varies widely by model and quantization. Llama 3.3-70B commonly runs at 128K–200K tokens depending on quantization and hardware. Check the model card.

---

## Context packaging strategies

Not everything belongs in context. What you include, summarize, or omit determines whether an agent is effective or wasteful.

### What to include

- The current task description (always)
- The agent's own system prompt and skills (always — these are part of its context budget)
- The specific files directly relevant to the task
- The handoff YAML from the previous agent
- Hard rules and constraints that apply to this step

### What to summarize rather than include verbatim

- Long conversation history from previous turns (use `/compact` to produce a summary)
- Tool call results that are partially relevant (extract and include only the relevant section)
- Large files where only a portion matters (include the relevant function or class, not the whole file)
- Previously generated plans or intermediate reasoning that is no longer being iterated on

### What to omit

- File contents not referenced by the task
- Prior session history from yesterday's work (start a new session; load only what matters)
- Tool schemas for tools the agent won't use in this step
- Verbose library documentation when you can include just the relevant API signatures

The goal is to include everything the agent needs and nothing it doesn't. Padding context with "might be useful" content costs tokens on every call and can degrade output quality by diluting the signal.

---

## When to fork a new session vs. compact the current one

| Situation | Action |
|---|---|
| Approaching 70–80% of token budget mid-task | Compact: run `/compact`, continue in same session |
| Task is complete; next task is unrelated | Fork: start a new session, load only what the new task needs |
| Same task, but history has grown very long | Compact first; if compacted history is still too large, fork |
| Starting a new workstream from scratch | Fork: every workstream starts with a fresh context |
| The agent has produced noise (wrong paths, abandoned approaches) | Fork: compacting preserves the noise in summary form |
| Context contains a secret accidentally pasted | Fork immediately; do not compact (compact preserves it) |

`/compact` asks the model to summarize the current session into a short representation, then continues with that summary as the history. It reduces context size but loses detail. Use it when you need continuity but not verbatim history.

A new session starts clean. Use it when continuity is not needed or when the accumulated history is doing more harm than good.

---

## The role of memory files in managing context across sessions

Certain files are loaded at the start of every Claude Code session:

| File | Scope | Purpose |
|---|---|---|
| `CLAUDE.md` (project) | All sessions in this repo | Project-specific rules and conventions |
| `~/.claude/CLAUDE.md` (user) | All sessions, all repos | Personal preferences and global rules |
| `AGENTS.md` | Read by agents explicitly | Cross-tool brief; workstream and hard rule summary |
| `.claude/agents/<name>.md` | Loaded when the agent runs | System prompt for that specific agent |

These files are loaded on every session or every invocation. Every token in them is paid for every time.

Keep them lean:

- `CLAUDE.md` should contain rules, not documentation. Documentation belongs in `docs/`.
- `AGENTS.md` has a documented limit: keep it at 150 lines or fewer.
- Agent prompts in `.claude/agents/` should specify what to do, not explain why at length. The "why" belongs in `docs/concepts/`.
- Do not put large reference tables or full API specs in memory files. Put them in files agents can read on demand.

A bloated `CLAUDE.md` is not "more context" — it is a tax on every session, before the agent has done anything useful. Cut anything that is not a rule or a pointer to a rule.

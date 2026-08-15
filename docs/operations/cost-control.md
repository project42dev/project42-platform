# Cost Control

> Date: 2026-04-28

Token spend scales with workstream complexity, model choice, and prompt discipline. Left unmanaged, a team running build workstreams on Opus 4.7 for every task — including routing decisions — will burn through budget faster than the work justifies.

This document covers the concrete levers.

---

## Model-tier matching

The most impactful cost control is not a technical change — it is choosing the right model for the task.

| Task class | Right model | Wrong model | Why it matters |
|---|---|---|---|
| Routing decision (classify task) | Sonnet 4.6 or GPT-5.4 nano | Opus 4.7 | Routing is classification, not reasoning. Opus for routing costs ~18x more than Haiku. |
| Greenfield feature in unfamiliar large codebase | Opus 4.7 | Haiku 4.5 | 1M context and superior agentic loop justify the cost. |
| Refactor in familiar codebase | Sonnet 4.6 | Opus 4.7 | Quality comparable; cost ~5x lower. |
| Commit message generation | Haiku 4.5 or GPT-5.4 nano | Sonnet 4.6 | Pure summarization. Cheap models are sufficient. |
| Log summarization | Haiku 4.5 or GPT-5.4 nano | Opus 4.7 | Pattern matching, not reasoning. |
| Cross-family code review | GPT-5.4 (Foundry) | GPT-5.5 | GPT-5.4 sufficient for review; GPT-5.5 for deeper long-context tasks. |
| Sensitive / data-residency work | Foundry custom or local Ollama | Any cloud model | Not a cost choice — a compliance choice. |

From `MODELS.md`: the router agent uses Sonnet 4.6 by default (budget: 8K tokens). The coder defaults to Opus 4.7 for non-trivial builds, Sonnet 4.6 for refactors. These defaults reflect quality requirements, not convenience.

Override the default model in the agent's frontmatter when you have evidence a cheaper model is sufficient for your specific workload. Do not guess — use evals (see the observability doc) to confirm quality is maintained.

---

## Prompt caching

The Anthropic API supports prompt caching: when the beginning of a system prompt (the "cache prefix") is identical across calls and meets the minimum length, subsequent calls with the same prefix are billed at a discounted cache-hit rate.

How it works:

- The first call with a prompt prefix is a cache miss — billed at the standard input rate.
- Subsequent calls within the cache TTL (~5 minutes for default; extended with `cache_control`) that share the same prefix are cache hits — billed at roughly 10% of the standard input rate.
- Output tokens are always billed at the full output rate. Caching only applies to input tokens.

What benefits from caching:

| Content | Cache benefit |
|---|---|
| System prompts (CLAUDE.md, agent instructions) | High — these are identical across every call in a session |
| Loaded skill files | High — same content per workstream |
| Large reference documents read at session start | High — static content |
| Conversation history | Moderate — history grows, so prefix changes every turn |
| Tool call results from earlier in the session | Low — unique per call |

To maximize cache benefit in this repo: keep system prompts stable (do not randomize or inject per-call content into the system prompt), load reference files once at the start of a session, and use `cache_control: ephemeral` for long static documents passed to the model.

The cache TTL is ~5 minutes by default. Sleeping or taking breaks that exceed 5 minutes will miss the cache on the next call. For long-running workstreams with pauses, consider the extended cache TTL options in the Anthropic API (check current docs — this feature evolves).

---

## Context summarization

Long sessions accumulate context. Context costs input tokens on every call.

When to compact vs. fork:

| Situation | Action |
|---|---|
| Mid-task, approaching 70–80% of budget | `/compact` — summarize and continue |
| Task complete, next task is unrelated | New session |
| History has grown noisy with abandoned paths | New session (compacting preserves the noise in summary) |
| Need to hand off to a different agent | Use the handoff contract — not the full session history |

`/compact` is not free. It costs tokens to generate the summary, and the summary is less information-dense than the original. Use it for continuity, not as a routine cost-saving measure — the savings on subsequent calls outweigh the cost of compaction only if the session will continue for many more turns.

For workstream handoffs specifically: the handoff YAML contract exists precisely to avoid passing session history between agents. The reviewer does not need the coder's scratchpad — it needs the structured output. Keep handoffs small.

---

## Eval-driven routing

The right model for a task is the cheapest model that produces acceptable output for that task, on your codebase, with your prompts. "Acceptable" is defined by your evals.

The process:

1. Define an eval rubric for the task type (e.g., for code review: correctness catch rate, false positive rate, security issue detection).
2. Run the task on a sample of real inputs with two models: the current model and a cheaper candidate.
3. Compare eval scores.
4. If the cheaper model's scores meet your threshold, route to it.

This is not a one-time exercise. Model quality changes with updates. Prompt changes affect which model is sufficient. Run evals when changing models and when changing prompts.

From `MODELS.md`: the Foundry Model Router advertises ~60% cost reduction by auto-selecting within the GPT-5 family. This is a form of automated eval-driven routing — the router is trained to predict which model in the family will produce acceptable output at lower cost for a given prompt. You can apply the same logic manually across families.

---

## Gateway-level caching

Gateways (Helicone, Portkey, LiteLLM) can cache complete prompt-response pairs at the HTTP layer. When an identical prompt is sent again, the cached response is returned without any model call.

This is distinct from Anthropic's prompt caching:

| Caching type | What is cached | Where | Cost |
|---|---|---|---|
| Anthropic prompt cache | Prompt prefix (input tokens) | Anthropic API | Billed at ~10% of input rate |
| Gateway response cache | Full response for identical prompts | Gateway | Zero inference cost |

Gateway caching is most useful for:

- High-volume, repetitive routing decisions (same classification prompt sent many times)
- Documentation generation tasks where the same source file produces the same docs
- Testing environments where you want deterministic responses

Gateway caching is not useful for tasks where the prompt varies per call (most agentic workstreams). Do not over-invest in configuring it for tasks where the cache hit rate will be near zero.

---

## Concrete example: a build workstream token breakdown

A medium-complexity feature — adding a single API endpoint to an existing service:

| Agent | Model | Input tokens | Output tokens | Est. cost (Anthropic pricing) |
|---|---|---|---|---|
| router | Sonnet 4.6 | 2,000 | 500 | ~$0.01 |
| planner | Sonnet 4.6 | 10,000 | 5,000 | ~$0.10 |
| coder | Opus 4.7 | 60,000 | 20,000 | ~$2.40 |
| reviewer | GPT-5.4 (Foundry) | 30,000 | 10,000 | varies by Azure pricing |
| documenter | Sonnet 4.6 | 8,000 | 2,000 | ~$0.05 |
| **total** | | **~110,000** | **~37,500** | **~$2.60+ (varies)** |

Total: approximately 147,500 tokens, approximately $2.60+ depending on Foundry pricing for the reviewer.

### Where to reduce each line

| Agent | Reduction lever | Est. saving |
|---|---|---|
| router | Already on Sonnet; further reduce by keeping the routing prompt minimal | Marginal |
| planner | Sonnet is appropriate; reduce input by not loading irrelevant files during planning | 20–40% of input |
| coder | Biggest spend. Use Sonnet instead of Opus for familiar codebases with established patterns. Use prompt caching for the system prompt. Filter tool results before returning them to context. | 40–60% of cost |
| reviewer | Foundry Model Router may route to GPT-5.4 mini for simple reviews, reducing cost. Define eval thresholds so lightweight reviews route to cheaper models. | 30–50% |
| documenter | Already on Sonnet. Pass only the handoff YAML and the files that changed — not the full codebase. | 30–40% of input |

Applying these levers to the example above:

| Agent | Original | Optimized | Change |
|---|---|---|---|
| router | 2,500 tokens | 2,000 tokens | Tighter prompt |
| planner | 15,000 tokens | 10,000 tokens | Scoped file loading |
| coder | 80,000 tokens | 35,000 tokens | Sonnet + filtered context + cached prompt |
| reviewer | 40,000 tokens | 25,000 tokens | Model Router routes to mini for straightforward review |
| documenter | 10,000 tokens | 7,000 tokens | Scoped input |
| **total** | **~147,500** | **~79,000** | **~46% reduction** |

The largest gain is almost always in the coder step: model selection (Sonnet vs Opus for the right tasks) and context discipline (don't load the whole repo when three files are relevant).

Prompt caching on the coder's system prompt adds incremental savings in session-heavy workloads, but the model selection and context scoping decisions above have a larger absolute impact.

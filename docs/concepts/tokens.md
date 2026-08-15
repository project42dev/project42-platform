# Tokens

> Date: 2026-04-28

---

## What a token is

A token is the unit of text a language model processes. It is not a word, a character, or a byte — it sits somewhere between all three, depending on the tokenizer.

As a rough working estimate:

- 1 token ≈ ¾ of an English word
- 100 tokens ≈ 75 English words, or about a short paragraph
- 1,000 tokens ≈ 750 words, roughly one to two pages of prose

This holds for standard English prose. The ratio changes significantly for:

| Content type | Approximate ratio |
|---|---|
| English prose | ~0.75 words per token |
| Code (Python, TypeScript) | ~0.5–0.6 words per token (syntax inflates count) |
| Non-Latin scripts (Chinese, Japanese, Korean) | ~1–4 characters per token |
| Minified JSON or structured data | Highly variable |
| Long integers, hashes, UUIDs | Often 1 character per token |

If you're processing logs, structured data, or non-English content, the real token count can be two to four times what the word count suggests. Use the provider's tokenizer (e.g., Anthropic's token counter in the API or Claude.ai's token display) to verify before committing to a cost estimate.

---

## How pricing works

LLM pricing has two distinct rates: one for input tokens and one for output tokens. Output tokens are consistently more expensive.

Anthropic also offers a third rate for prompt cache hits: tokens that appear in a "cacheable" prefix of a system prompt are cheaper on subsequent calls if the prefix has not changed.

### Anthropic (approximate, date-stamped 2026-04-28)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Cached input |
|---|---|---|---|
| Claude Opus 4.7 | ~$15 | ~$75 | ~$1.50 |
| Claude Sonnet 4.6 | ~$3 | ~$15 | ~$0.30 |
| Claude Haiku 4.5 | ~$0.80 | ~$4 | ~$0.08 |

These are approximate and may have changed. Verify at [anthropic.com/pricing](https://www.anthropic.com/pricing) before making cost decisions. The caching discount makes long, stable system prompts substantially cheaper over time.

### OpenAI via Azure Foundry (approximate, date-stamped 2026-04-28)

Pricing for GPT-5.x via Azure Foundry depends on the deployment type (Standard vs Provisioned Throughput Units), the region, and any enterprise agreements. Foundry's Model Router claims ~60% cost reduction over always-frontier by routing to cheaper models when possible. Verify current pricing in the Azure portal or via `az cognitiveservices account deployment show`.

The general pattern: nano < mini < base model, consistent with Anthropic's Haiku < Sonnet < Opus ordering.

---

## Estimating token burn before a workstream starts

Estimate before committing to a workstream, especially for build and investigate tasks:

1. **Count the files in scope.** An average TypeScript source file is roughly 200–400 lines, which is 2,000–5,000 tokens. A large file (1,000+ lines) can be 10,000–20,000 tokens.

2. **Add system prompt overhead.** The agent's own instructions, loaded memory files, and tool schemas typically cost 2,000–8,000 tokens per agent invocation.

3. **Account for output.** Code generation and explanation output is usually 20–40% of the input volume. A coder reading 50K tokens of context will produce roughly 10K–20K tokens of output.

4. **Multiply by the number of agents.** A build workstream invokes at minimum three agents (coder, reviewer, documenter). Each has its own context.

A rough build workstream estimate for a medium-complexity feature:

| Agent | Input tokens | Output tokens | Subtotal |
|---|---|---|---|
| router | 2,000 | 500 | 2,500 |
| planner | 10,000 | 5,000 | 15,000 |
| coder | 60,000 | 20,000 | 80,000 |
| reviewer | 30,000 | 10,000 | 40,000 |
| documenter | 8,000 | 2,000 | 10,000 |
| **total** | | | **~147,500** |

This is a medium feature. For a large feature (Opus 4.7, many files, 2 revision rounds), multiply by two to four.

---

## Common waste patterns and fixes

### Over-verbose system prompts

**Pattern:** System prompts that include full documentation, long rationale paragraphs, or repeated information already in other loaded files.

**Fix:** Strip system prompts to rules and pointers. Documentation lives in `docs/`. Rationale lives in `docs/concepts/`. The system prompt tells the agent what to do, not why the framework works the way it does.

### Repeating large context unnecessarily

**Pattern:** A long session continues for many turns, accumulating tool call results and history, until context is nearly full.

**Fix:** Use `/compact` at 70–80% of budget to compress history into a summary. For tasks that span multiple sessions, start fresh and load only the files needed — do not resume a bloated session.

### Tool result bloat

**Pattern:** A `Read` tool call returns an entire 2,000-line file when only 40 lines are relevant. The full content sits in context for the rest of the session.

**Fix:** Extract only the relevant section before returning. If the agent cannot know in advance which section it needs, it should read a small portion first, identify the relevant range, then read only that range.

### Long preambles

**Pattern:** Agent prompts that begin with "You are a helpful, thorough, and meticulous senior software engineer who cares deeply about code quality..." — several sentences before any actual instruction.

**Fix:** Start with the first instruction. The model already knows what it is. The preamble costs tokens and adds nothing.

### Unnecessary model calls for trivial tasks

**Pattern:** Using Opus 4.7 to generate a commit message or classify a log line.

**Fix:** Use Haiku 4.5 or GPT-5.4 nano for high-volume, low-stakes tasks. See `MODELS.md` Rule 2 for the task-to-model mapping.

---

## Token budget enforcement

Every agent in Project 42 has a defined token budget and a stop-and-summarize threshold. From `MODELS.md`:

| Agent | Default budget | Stop-and-summarize at |
|---|---|---|
| router | 8K tokens | 6K |
| coder | 200K tokens | 160K |
| reviewer | 100K tokens | 80K |
| documenter | 50K tokens | 40K |
| test-writer | 100K tokens | 80K |
| security-reviewer | 50K tokens | 40K |
| investigator | 200K tokens | 160K |
| operator | 50K tokens | 40K |
| planner | 30K tokens | 24K |

At the stop-and-summarize threshold (70–80% of budget), the agent stops its current work, produces a summary of what it has done and what remains, and hands off. It does not continue until context is consumed. This is hard rule 5 in `AGENTS.md`.

The reason for the 70–80% threshold rather than running to the limit: the final 20–30% of a context window is increasingly low quality. The model begins to lose track of earlier content, produces inconsistent output, and may hallucinate. Stopping early preserves quality.

Budgets can be overridden in the agent's frontmatter for a specific task, but the stop-and-summarize behavior cannot be disabled. It is enforced by the agent's system prompt.


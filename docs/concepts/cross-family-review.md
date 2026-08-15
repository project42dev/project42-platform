# Cross-Family Review

> Date: 2026-04-28

The cornerstone rule of Project 42: the reviewer model family must not match the coder model family.

---

## Why same-family review fails

A code reviewer that shares architecture, training data, and alignment decisions with the coder will tend to make the same mistakes the coder makes. The errors are correlated.

This is not hypothetical. Language models trained on the same data distribution tend to produce the same systematic errors on the same inputs. If a model consistently mishandles a particular pattern — edge cases in concurrent code, a subtle security flaw in a common idiom — a reviewer from the same family is likely to miss it for the same reason. The reviewer "nods" at the coder's output because both agents have the same blind spots.

The failure mode is silent. The review passes. The bug ships. There is no signal that the review was inadequate.

Using a reviewer from a different model family — different training data, different architecture, different alignment — breaks the correlation. The reviewer's blind spots are not the same as the coder's. Coverage improves. The improvement is not theoretical: different families catch different bugs on the same codebases in practice.

This is the same logic behind why humans do peer review across teams rather than self-review, and why audit firms rotate partners. Correlated judgment is not independent review.

---

## What counts as a "family"

| Family | Models |
|---|---|
| Anthropic (Claude) | Claude Opus 4.x, Sonnet 4.x, Haiku 4.x — any Claude model |
| OpenAI / Microsoft | GPT-5, GPT-5.4, GPT-5.4 mini, GPT-5.4 nano, GPT-5.5, any GPT-5.x variant |
| Google | Gemini family (any variant) |
| Open-weight | Llama, DeepSeek, Mistral, Qwen, Phi, Nemotron — each open-weight lineage is a separate family |

Variants within a family do not escape the rule. Claude Sonnet reviewing Claude Opus output is same-family review. GPT-5.4 nano reviewing GPT-5 output is same-family review.

Fine-tuned models inherit their base family. A fine-tuned Claude Sonnet on Azure is still Anthropic family.

---

## How the reviewer subagent enforces the rule

The `reviewer` subagent (`.claude/agents/reviewer.md`) checks the model family of the coder before beginning review. If the coder and reviewer are the same family, it refuses to proceed and returns an error:

```
reviewer: cross-family rule violation
coder family: anthropic
reviewer family: anthropic
action: halted — assign a reviewer from a different model family
```

This check happens at the handoff boundary, not at task completion. The workstream stops before the reviewer does any work, not after a review that should not have occurred.

To configure a different-family reviewer, set the `model` field in the reviewer subagent's frontmatter in `.claude/agents/reviewer.md`. The default reviewer uses Claude (Anthropic family), so it is correct when the coder is GPT-5.x or an open-weight model. When the coder is Claude, you must override the reviewer's model.

---

## Practical setup: Claude Code coder, GPT-5.4 reviewer via Foundry

The most common configuration in this repo:

- **Coder:** Claude Code (Anthropic family) — Opus 4.7 or Sonnet 4.6
- **Reviewer:** GPT-5.4 via Microsoft Azure AI Foundry (OpenAI/Microsoft family)

To configure this:

1. Ensure your Azure subscription has GPT-5.4 deployed. Verify regional availability — not all regions have it at GA. See `MODELS.md` for the note on phased rollouts.

2. In `.claude/agents/reviewer.md`, set the model and the Foundry endpoint:

```yaml
---
name: reviewer
model: azure/gpt-5.4          # LiteLLM-style prefix, or your gateway's syntax
tools: [Read]
skills: []
---
```

3. If you are routing through LiteLLM or Portkey, ensure the gateway is configured with your Foundry credentials and the `azure/gpt-5.4` model alias resolves to your deployment.

4. The handoff YAML from the coder goes to the router, which dispatches to the reviewer subagent. The reviewer receives the payload, checks the family, and proceeds.

Alternatively, you can configure the Foundry Model Router as the reviewer. It will auto-select among GPT-5 family models per request, which keeps the family consistent (all OpenAI/Microsoft) while optimizing cost.

---

## What to do when you only have one model family

If your team only has access to Anthropic API (Claude), you cannot satisfy the cross-family rule with a commercial model. Options in order of preference:

| Option | Notes |
|---|---|
| Use an open-weight model as reviewer | Run Llama, Mistral, or DeepSeek via Ollama locally. Open-weight counts as a separate family from Claude. |
| Use Gemini API (free tier) | Gemini family is separate from Anthropic. Gemini CLI is free. Rate limits apply. |
| Document the exception | If neither option is available, document the exception in the handoff YAML under `open_questions`. Record why same-family review was used and flag the output as higher-risk. |

Do not silently run same-family review and omit the exception. The point of the rule is that the output is treated differently — flagged for more careful human review — when the cross-family guarantee cannot be met.

The `reviewer` subagent, when it detects a single-family situation and an override flag is set, will emit a warning in the findings section of its output:

```yaml
review:
  cross_family_satisfied: false
  exception_reason: "only anthropic family available"
  risk_flag: "this review has correlated blind spots with the coder — human review recommended"
```

---

## Summary

| Situation | Correct action |
|---|---|
| Coder = Claude, Reviewer = GPT-5.4 | Proceed. Cross-family satisfied. |
| Coder = Claude, Reviewer = Claude | Halt. Configure a different-family reviewer. |
| Coder = GPT-5.4, Reviewer = Claude | Proceed. Cross-family satisfied. |
| Coder = Llama (open-weight), Reviewer = Claude | Proceed. Open-weight and Anthropic are separate families. |
| Only one family available | Use open-weight fallback. Document exception. Flag output. |


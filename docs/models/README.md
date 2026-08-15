# Models Reference Index

**Last verified:** 2026-04-28

Detailed documentation for every model family available to this project. See `MODELS.md` at the repo root for the routing matrix and operational rules. These docs cover background, access paths, and selection guidance for each family.

---

## Model families

| File | Family | Provider | When to reach for it |
|---|---|---|---|
| [claude.md](claude.md) | Claude (Opus 4.7, Sonnet 4.6, Haiku 4.5) | Anthropic | Default for all coding and agentic work; 1M context on Opus |
| [foundry-gpt5.md](foundry-gpt5.md) | GPT-5 family (GPT-5, GPT-5.4, GPT-5.4 mini, GPT-5.4 nano, GPT-5.5) | OpenAI via Microsoft Azure AI Foundry | Cross-family review; Microsoft/Azure-first compliance; Foundry routing |
| [foundry-other.md](foundry-other.md) | DeepSeek, Llama, Cohere, Mistral, xAI, gpt-oss, custom fine-tunes | Microsoft Azure AI Foundry | Open-model access via Azure; custom fine-tunes for domain specialization |
| [gemini.md](gemini.md) | Gemini family | Google | Long-context analysis; free CLI access; cross-family review when Foundry unavailable |
| [open-weight.md](open-weight.md) | Llama, DeepSeek, Mistral, Qwen, Phi, Nemotron, gpt-oss | Self-hosted / local | Data residency requirements; offline; cost at scale |

---

## Cross-cutting rules

These rules apply regardless of which family you pick. Full rules live in `MODELS.md`.

- **Cross-family review is mandatory.** The reviewer must run on a different model family than the coder. Shared architecture means correlated blind spots.
- **Start with the mid-tier.** Sonnet 4.6 or GPT-5.4 mini covers most tasks. Escalate to frontier (Opus 4.7, GPT-5.5) only when the mid-tier fails.
- **GA does not mean universally available.** GPT-5.x on Azure Foundry rolls out regionally. Verify before committing a workstream to a model.
- **Pricing changes.** Check provider pricing pages before quoting numbers in documentation or proposals.

---

## Decision shortcut

```
Need agentic coding right now?
  → Claude (claude.md) via Claude Code CLI or VS Code ext

Need a reviewer from a different family?
  → GPT-5.4 via Foundry (foundry-gpt5.md) — first choice
  → Gemini (gemini.md) — if Foundry unavailable

Data residency / offline / cost at scale?
  → Open-weight local (open-weight.md)

Azure-first shop or specific Foundry model?
  → foundry-gpt5.md or foundry-other.md
```

Full decision tree: `docs/decisions/model-routing.md`

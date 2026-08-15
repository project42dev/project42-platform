# Gemini Family — Google

**Last verified:** 2026-04-28
**Context window note:** Gemini context window sizes change with model releases. Verify current values at [ai.google.dev](https://ai.google.dev) before designing a workstream around a specific window size.

---

## Role in this project

Gemini is the third model family in the cross-family review rotation. It serves two distinct purposes:

1. **Cross-family reviewer** when GPT-5.x via Foundry is unavailable (regional rollout gaps, quota exhaustion, Azure outage).
2. **Long-context analysis** — Gemini's context windows are among the largest available, making it the go-to for tasks that exceed Claude Sonnet's 200K limit and where you do not want to pay Opus 4.7 rates.

---

## Model overview

Gemini releases and context windows are updated frequently. As of April 2026:

| Model tier | Approximate context | Strengths | Notes |
|---|---|---|---|
| **Gemini Ultra / Pro (latest)** | Up to ~1M tokens (verify) | Broad reasoning, long-context, multimodal | Frontier tier; comparable reasoning depth to Opus/GPT-5 |
| **Gemini Flash** | Up to ~1M tokens (verify) | Fast, low cost; good for high-volume tasks | Mid-tier equivalent; strong cost/speed balance |
| **Gemini Flash Lite / Nano** | Varies (verify) | Cheapest; on-device capable | High-volume classification, summarization |

Verify current model names, context limits, and pricing at [ai.google.dev](https://ai.google.dev) — Google renames and rebrands Gemini tiers more frequently than other providers.

---

## Access paths

| Path | Cost | Best for |
|---|---|---|
| **Gemini CLI** (`gemini` command-line tool) | Free tier available | Ad-hoc long-context analysis; cross-family review without API setup |
| **Google AI Studio** (aistudio.google.com) | Free tier available; paid via API key | Interactive use, prompt development, no-code access |
| **Google AI API** (api key from AI Studio) | Pay-per-token above free tier | Programmatic access; SDK integration |
| **Vertex AI** (Google Cloud) | Pay-per-token; enterprise billing | Production workloads needing Google Cloud data residency, IAM, audit logging |

**The Gemini CLI is the lowest-friction entry point.** Install once, authenticate with a Google account, and you have access to Gemini models from the terminal with no API key management. Useful for one-off cross-family review tasks.

---

## When to use Gemini

| Scenario | Gemini | Why |
|---|---|---|
| Cross-family review; GPT-5.4 on Foundry unavailable | Yes | Different training lineage; satisfies cross-family rule |
| Long-context analysis > 200K tokens; don't need Opus reasoning depth | Yes | Large context at lower cost than Opus 4.7 |
| Long-context analysis > 1M tokens | Yes — if window is confirmed at this size | Verify current window; may be the only option at this scale |
| Cost-effective alternative to Opus for large document reads | Sometimes | Compare current Gemini Flash vs Opus 4.7 pricing at task scale |
| Cross-family review; GPT-5.4 on Foundry IS available | No | GPT-5.4 is the preferred reviewer; Gemini is the fallback |
| Primary coder for agentic work | No | Claude Code ecosystem (skills, MCP, hooks, subagents) is the primary; don't fragment it |

---

## Integration patterns

### Gemini CLI for cross-family review

```bash
# Install
pip install google-genai   # or: npm install -g @google/gemini-cli (verify current package name)

# Authenticate
gemini auth login

# Review a file
gemini -m gemini-pro "Review this code for correctness and security issues:" < path/to/file.py
```

### Google AI API (Python)

```python
import google.generativeai as genai

genai.configure(api_key="[YOUR_API_KEY]")
model = genai.GenerativeModel("[MODEL_NAME]")  # e.g., "gemini-1.5-pro" — verify current name

response = model.generate_content("[PROMPT]")
print(response.text)
```

Verify the current SDK package name and model identifiers at [ai.google.dev/gemini-api/docs](https://ai.google.dev/gemini-api/docs).

---

## Limitations

- **No native agentic loop integration** — Gemini is not wired into Claude Code's skills, MCP, or hooks ecosystem. Use it as a call-out from a workstream (e.g., the reviewer agent calls Gemini via API), not as the primary agent runtime.
- **Model naming instability** — Google renames models more frequently than Anthropic or OpenAI. Pin model IDs explicitly in code and recheck them at each project milestone.
- **Free tier rate limits** — the free Gemini API tier has strict RPM/TPM limits. For production review pipelines, use a paid API key or Vertex AI.
- **Data residency** — Google AI API routes through Google's global infrastructure. For strict data residency, use Vertex AI with a specific regional endpoint.

---

## Related

- `docs/models/foundry-gpt5.md` — preferred cross-family reviewer (GPT-5.4)
- `docs/models/open-weight.md` — another cross-family option when no external API is acceptable
- `docs/decisions/model-routing.md` — worked examples including the Gemini fallback path
- `MODELS.md` — routing matrix

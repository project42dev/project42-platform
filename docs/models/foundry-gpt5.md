# GPT-5 Family via Microsoft Azure AI Foundry

**Last verified:** 2026-04-28
**Regional availability warning:** GA status means the model passed production readiness review — not that it is deployed in every Azure region or every deployment type (Standard vs. Provisioned). Phased rollouts can leave specific regions or subscription tiers without access for weeks after the official GA date. Always verify availability in your specific region and deployment type before committing a workstream to a GPT-5.x model.

---

## Model overview

| Model | GA date | Strengths | Primary use cases |
|---|---|---|---|
| **GPT-5** | January 2026 | Frontier reasoning and generation, broad capability | General cross-family review; complex reasoning tasks needing a non-Claude perspective |
| **GPT-5.4** | March 5, 2026 | Production-grade agentic execution, computer use, document and spreadsheet generation | Cross-family code review; agentic tasks in Microsoft ecosystem; document generation pipelines |
| **GPT-5.4 mini** | March 18, 2026 | Lower latency and lower cost than GPT-5.4 | High-volume review tasks; latency-sensitive pipelines where full GPT-5.4 is overkill |
| **GPT-5.4 nano** | March 18, 2026 | Cheapest in the GPT-5 family | High-volume, low-stakes tasks: commit message review, log summarization, classification |
| **GPT-5.5** | April 2026 | Deeper long-context reasoning, more reliable agentic execution, improved computer-use accuracy | Long-context analysis; agentic tasks requiring sustained coherence over many steps |
| **Foundry Model Router** | — | Fine-tuned small LM that selects the right GPT-5 family model per request; advertised ~60% cost reduction vs always routing to frontier | Cost-aware pipelines where task complexity varies; any pipeline where you would otherwise route manually |

---

## Access path

1. **Azure subscription** — required. No Azure account, no Foundry access.
2. **Create a Foundry resource** in the Azure portal under Azure AI Foundry (formerly Azure OpenAI Service).
3. **Deploy a model** — in Foundry Studio, navigate to the model catalog and deploy the target model to your resource. Deployment type: Standard (pay-per-token) or Provisioned (reserved throughput).
4. **Get endpoint + API key** — each deployment produces a unique endpoint URL and key. Store these in your secrets manager, not in code.
5. **Call via Azure OpenAI SDK or REST** — Foundry uses the OpenAI API surface. Drop-in compatible with the `openai` Python/Node SDK by changing `base_url` and `api_key`.

```python
from openai import AzureOpenAI

client = AzureOpenAI(
    azure_endpoint="https://[YOUR-RESOURCE].openai.azure.com/",
    api_key="[YOUR-API-KEY]",
    api_version="2024-12-01-preview",
)

response = client.chat.completions.create(
    model="[YOUR-DEPLOYMENT-NAME]",  # deployment name, not model name
    messages=[{"role": "user", "content": "[PROMPT]"}],
)
```

---

## Foundry Model Router

The Foundry Model Router is a fine-tuned small language model that sits in front of the GPT-5 family and selects the appropriate model (GPT-5.4 nano, mini, full, GPT-5, GPT-5.5) based on estimated task complexity. Microsoft advertises approximately 60% cost reduction vs. always routing to the frontier model.

**When to use it:**
- Pipelines where request complexity varies significantly (some simple, some hard).
- Any workflow where you would otherwise manually decide between nano/mini/full on each call.
- Cost-sensitive automation at scale.

**When not to use it:**
- You specifically need a given model (e.g., GPT-5.5 for long-context) — the router may downgrade it.
- You need deterministic model selection for reproducibility or audit purposes.
- Latency on the routing decision itself would be unacceptable for your SLA.

---

## Model selection table

| Criteria | Choice | Why |
|---|---|---|
| Cross-family review of Claude-generated code, standard complexity | GPT-5.4 mini | Good quality, lower cost than full GPT-5.4, fast enough for review loops |
| Cross-family review, architecture-level or complex auth/security code | GPT-5.4 or GPT-5.5 | Need the full reasoning depth; don't economize on security review |
| High-volume batch review (100+ PRs) | GPT-5.4 nano or Foundry Model Router | Cost ceiling matters; nano is sufficient for pattern-based review |
| Agentic task in Microsoft ecosystem (Azure resources, Office documents) | GPT-5.4 | Designed for this; computer use and document generation are first-class |
| Long-context analysis (>200K tokens) | GPT-5.5 | Deeper long-context reliability |
| Variable-complexity pipeline, cost-sensitive | Foundry Model Router | Auto-selects; ~60% cost savings advertised |

---

## Billing

Foundry pricing is per-token, billed through your Azure subscription. Two deployment types:

| Type | How it works | Best for |
|---|---|---|
| **Standard** | Pay-per-token; shared capacity | Sporadic use, variable load |
| **Provisioned** (PTU) | Reserved throughput units; flat monthly commitment | Predictable high-volume production workloads |

Check current pricing at the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) — Foundry model prices update frequently.

---

## Regional availability caveat

As of April 2026, GPT-5.x models are rolling out in phases across Azure regions. Known patterns:

- **East US / West US 2 / Sweden Central** tend to receive new models first.
- **Standard deployments** may not be available in a region even after the model reaches GA in another.
- **Provisioned deployments** often lag Standard by additional weeks.
- The Foundry portal shows real-time availability per region when you attempt a deployment.

Design your workstreams with a fallback: if GPT-5.4 is unavailable in your primary region, route cross-family review to Gemini rather than blocking.

---

## Related

- `docs/models/foundry-other.md` — other models available in Foundry (DeepSeek, Llama, Cohere, Mistral, custom)
- `docs/models/gemini.md` — fallback cross-family reviewer
- `docs/decisions/model-routing.md` — worked examples including Foundry routing
- `MODELS.md` — routing matrix

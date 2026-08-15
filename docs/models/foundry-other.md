# Other Models via Microsoft Azure AI Foundry

**Last verified:** 2026-04-28
**Catalog warning:** The Foundry model catalog changes frequently. Models are added, updated, and sometimes removed. Verify current availability in the [Foundry portal](https://ai.azure.com) before depending on any specific model here.

---

## Available models (April 2026)

### DeepSeek

| Model | Strengths | Notes |
|---|---|---|
| **DeepSeek-V3** | Strong coding and general reasoning; competitive with frontier models on coding benchmarks | Available via Foundry model catalog |
| **DeepSeek-V3.1** | Incremental improvement over V3; better instruction following | Verify current availability — catalog entry may vary by region |
| **DeepSeek-R1** | Reasoning-focused; comparable to o1 on math and code reasoning tasks | R1 is a reasoning model; prompt differently from chat models |

**Use cases:** Cross-family review when you want an open-weight perspective; coding tasks at lower cost than GPT-5.x; math and reasoning-heavy analysis.

### Meta Llama

| Model | Strengths | Notes |
|---|---|---|
| **Llama-3.3-70B** | Strong general-purpose; good instruction following at 70B | Serverless API available in some regions |
| **Llama-4-Maverick** | Meta's 2025 multimodal release; strong general and code | Verify availability — newer addition to catalog |

**Use cases:** Broad general tasks; cases where you want a well-known open-weight baseline; cost-effective batch processing via Foundry serverless.

### OpenAI open-source

| Model | Strengths | Notes |
|---|---|---|
| **gpt-oss-120b** | OpenAI's open-source release at 120B parameters; capable across coding, reasoning, and generation | Available via Foundry; verify catalog status |

**Use cases:** Open-weight alternative with OpenAI training lineage; useful when you want open-weight reproducibility with familiar OpenAI-style behavior.

### Cohere

Availability varies by region. Cohere models (Command family) are strong at retrieval-augmented generation (RAG), structured output, and enterprise document tasks. Check Foundry catalog for current Command model versions.

### Mistral

Availability varies. Mistral offers models at multiple sizes (7B to Large). Mistral Large is competitive on European-language tasks and has strong function-calling support. Mistral is also one of the few open-weight providers with a native European data residency offering — relevant for GDPR-sensitive workloads.

### xAI

Availability varies. xAI's Grok models have appeared in the Foundry catalog. Verify before relying on them — catalog presence has been inconsistent.

---

## Custom and fine-tuned models

Azure AI Foundry lets you deploy your own fine-tuned models alongside catalog models. This is distinct from using catalog models as-is.

### When to use a custom fine-tune

| Situation | Fine-tune warranted? | Why |
|---|---|---|
| Domain-specific terminology (medical, legal, financial) | Sometimes | If prompting with few-shot examples still produces wrong terminology consistently |
| Org-specific output format (e.g., internal YAML schema) | Sometimes | If the base model reliably generates the schema with a system prompt, fine-tuning adds cost and maintenance overhead for little gain |
| Data residency requirement + specific model behavior | Yes | Fine-tune a small open-weight model and deploy it in your controlled region |
| Distilling a larger model's behavior into a smaller one | Yes | Cost reduction at scale after validating quality |
| "The model just needs to know our domain better" | Rarely | This is usually a retrieval problem (RAG), not a training problem |

**Rule:** Validate that fine-tuning beats few-shot prompting before committing to the training and deployment cost. Fine-tuning adds an ongoing maintenance burden (re-train on model updates, manage deployment lifecycle).

### How to access a custom fine-tune in Foundry

1. Prepare training data in JSONL format with `prompt`/`completion` pairs (or `messages` format for chat models).
2. Upload to Azure Blob Storage or directly via Foundry Studio.
3. Submit a fine-tuning job in Foundry Studio (AI Foundry > Fine-tuning).
4. Once complete, deploy the fine-tuned model to an endpoint.
5. Call via the same Azure OpenAI SDK surface as catalog models — use your deployment name.

---

## Choosing among Foundry catalog models

| Criteria | Choice | Why |
|---|---|---|
| Cross-family review with reasoning depth | DeepSeek-R1 | Reasoning-focused; different training lineage than GPT-5.x and Claude |
| Cross-family review, general coding | DeepSeek-V3 or Llama-4-Maverick | Strong coding baselines at lower cost than GPT-5.4 |
| RAG / document retrieval pipeline | Cohere Command (if available) | Designed for RAG; strong at structured extraction |
| European data residency + open model | Mistral Large | Native EU hosting option; strong multilingual |
| Open-weight with OpenAI-style behavior | gpt-oss-120b | Familiar API; open weights for inspection |
| Domain specialization, proprietary data | Custom fine-tune on small open-weight | Data control + tailored behavior |

---

## Operational notes

- **Serverless API vs. managed deployment:** Some Foundry catalog models offer a serverless API (pay-per-token, no deployment required). Others require you to create and manage a deployment. Check the catalog entry for each model.
- **Quota limits:** Foundry enforces quota per region per model. If you need high throughput, request quota increases in advance.
- **Model versioning:** When a catalog model is updated (e.g., DeepSeek-V3 → V3.1), your existing deployment may or may not auto-update. Pin deployment versions if reproducibility matters.
- **Licensing:** Open-weight models in the Foundry catalog come with their original licenses (Llama license, DeepSeek license, etc.). Review licensing terms before commercial use.

---

## Related

- `docs/models/foundry-gpt5.md` — GPT-5 family (the primary Foundry path)
- `docs/models/open-weight.md` — running the same open-weight models locally instead of via Foundry
- `docs/decisions/model-routing.md` — when to use Foundry vs. other providers
- `MODELS.md` — routing matrix

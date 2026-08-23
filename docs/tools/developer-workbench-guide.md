# Field Guide 2.0 Developer Workbench & Model Benchmark Matrix — Technical Guide

**Document ID:** `GUIDE-WB-001`  
**Version:** `1.0.0`  
**Epic Reference:** `AB#5112` / `AB#8208` / `AB#8209`  
**Standard:** Project 42 Developer Workbench Standard  

---

## 1. Overview & Objectives

Field Guide 2.0 transforms static reference documentation into an interactive developer workbench. Software engineers and AI architects can simulate, benchmark, inspect, and copy-paste production-grade configurations directly into their development workflows.

The workbench includes two primary capability pillars:
1. **Interactive Visual Architecture Explorers (`AB#8208`)**: Live interactive simulations of core transformer and agentic mechanics.
2. **Model Economics & Benchmark Matrix (`AB#8209`)**: Searchable, multi-dimensional frontier model comparison matrix.

---

## 2. Interactive Architecture Explorers (`AB#8208`)

### 2.1. Transformer Multi-Head Attention Explorer
- **Purpose:** Visually explains how queries ($Q$), keys ($K$), and values ($V$) interact in self-attention:
  $$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$
- **Interactive Controls:**
  - Dynamic token sequence input box.
  - Heatmap attention weight matrix visualization across multiple attention heads.
  - Temperature slider altering softmax sharpness.

### 2.2. Production RAG Ingestion & Query Pipeline Builder
- **Purpose:** Interactive walkthrough of enterprise document retrieval from ingestion to synthesis.
- **Interactive Stages:**
  1. *Document Parsing:* Markdown, PDF, HTML cleaning.
  2. *Chunking Strategy:* Fixed-size vs recursive character vs semantic sentence window chunking.
  3. *Hybrid Indexing:* Generating dense embeddings (OpenAI `text-embedding-3-small`, BGE) + sparse BM25 tokens.
  4. *Vector Retrieval:* Approximate Nearest Neighbor (ANN) search via HNSW index.
  5. *Cross-Encoder Re-Ranking:* Re-scoring top-k candidates with Cohere Rerank / BGE-Reranker.
  6. *Context Assembly:* Assembling prompt token budget with system citations.

### 2.3. Model Context Protocol (MCP) Bridge Inspector
- **Purpose:** Real-time visual debugger for JSON-RPC 2.0 STDIO and SSE message exchanges between LLM client hosts and tool servers.
- **Features:**
  - Live inspection of `tools/list`, `tools/call`, `resources/read`, and `prompts/get`.
  - Schema error highlighter identifying invalid tool parameter submissions.
  - Latency breakdown per tool roundtrip.

---

## 3. Live Model Economics & Benchmark Matrix (`AB#8209`)

### 3.1. Evaluation Dimensions & Metrics

The live matrix indexes **50+ frontier and open-weight models** across four critical dimensions:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MODEL EVALUATION DIMENSIONS                          │
├────────────────────┬────────────────────┬──────────────────────────────┤
│ 1. Economics ($)   │ 2. Speed (TPS)     │ 3. Capacity & Context        │
│ • Input cost / 1M  │ • Time-to-first-   │ • Context window (tokens)    │
│ • Output cost / 1M │   token (TTFT) ms  │ • Max output tokens          │
│ • Cache read / 1M  │ • Output tok / sec │ • Needle-in-haystack rank    │
├────────────────────┴────────────────────┴──────────────────────────────┤
│ 4. Verified Benchmark Scores                                           │
│ • MMLU-Pro (Reasoning)       • HumanEval / SWE-bench (Coding)          │
│ • MATH (Mathematical Logic)   • LiveBench (Contamination-Free)         │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2. Representative Benchmark Data Sample

| Model Name | Provider / Host | Input ($/1M) | Output ($/1M) | Context Window | Speed (tok/s) | MMLU-Pro | HumanEval |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GPT-4o** | OpenAI | $2.50 | $10.00 | 128,000 | 105 | 72.6% | 90.2% |
| **Claude 3.5 Sonnet** | Anthropic | $3.00 | $15.00 | 200,000 | 82 | 78.0% | 93.7% |
| **Gemini 1.5 Pro** | Google | $1.25 | $5.00 | 2,000,000 | 75 | 73.2% | 84.1% |
| **DeepSeek V3** | DeepSeek / Self-Host | $0.14 | $0.28 | 64,000 | 60 | 75.9% | 82.6% |
| **Llama 3.3 70B** | Meta / vLLM | $0.00 (Self) | $0.00 (Self) | 128,000 | 95 | 70.1% | 81.7% |
| **Mistral Large 2** | Mistral | $2.00 | $6.00 | 128,000 | 80 | 73.0% | 84.0% |
| **Grok 2** | xAI | $2.00 | $10.00 | 128,000 | 90 | 74.5% | 88.4% |

---

## 4. Production Implementation Cheatsheets

All workbench entries provide copy-paste production code snippets in **TypeScript**, **Python**, and **Docker Compose**:

### Example: TypeScript Guaranteed Structured Output via Zod & OpenAI SDK
```typescript
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const EntitySchema = z.object({
  entityName: z.string().describe("The canonical name of the organization or person"),
  category: z.enum(["tech", "finance", "healthcare", "government"]),
  confidenceScore: z.number().min(0).max(1)
});

const client = new OpenAI();

async function extractStructuredEntity(rawText: string) {
  const completion = await client.beta.chat.completions.parse({
    model: "gpt-4o-2024-08-06",
    messages: [
      { role: "system", content: "Extract canonical entities with high confidence." },
      { role: "user", content: rawText }
    ],
    response_format: zodResponseFormat(EntitySchema, "extracted_entity")
  });

  return completion.choices[0].message.parsed;
}
```

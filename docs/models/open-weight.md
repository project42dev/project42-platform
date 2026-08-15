# Open-Weight Models — Local and Self-Hosted

**Last verified:** 2026-04-28

Open-weight models are models whose weights are publicly released. You can download them and run them on your own hardware, inside your own infrastructure, with no data leaving your environment. This is distinct from "open source" (code + weights) and from models available via a public API (where the weights stay on the provider's servers).

---

## Available models (April 2026)

### Meta Llama

| Model | Parameters | Strengths | Notes |
|---|---|---|---|
| **Llama-3.3-70B** | 70B | Strong general purpose; good instruction following and coding | The practical ceiling for most local hardware setups; runs on 2× 40GB A100 or 4× consumer GPUs |
| **Llama-4-Maverick** | Varies (MoE architecture) | Meta's 2025 multimodal release; strong general, code, and reasoning | Larger memory footprint than 3.3-70B; verify hardware requirements |

**License:** Llama models carry the Meta Llama Community License. Commercial use is permitted with restrictions for deployments above 700M monthly active users. Read the license before shipping.

### DeepSeek

| Model | Parameters | Strengths | Notes |
|---|---|---|---|
| **DeepSeek-V3** | 671B (MoE, ~37B active) | Strong coding and reasoning; competitive with frontier on coding benchmarks | MoE means active parameter count is much smaller than total; more hardware-efficient than the number suggests |
| **DeepSeek-R1** | 671B (MoE) | Reasoning-focused; strong on math, code reasoning, step-by-step problems | Prompts differently than chat models — designed for chain-of-thought reasoning |

**License:** MIT. Commercial use permitted.

### Mistral

Multiple sizes, optimized for instruction following and function calling. Mistral 7B and Mistral NeMo (12B) run on consumer GPUs. Mistral Large requires significant hardware. Strong multilingual performance, particularly European languages.

**License:** Apache 2.0 (smaller models). Larger models vary — check per-release.

### Qwen (Alibaba)

Qwen2.5 family covers 0.5B to 72B parameters. Strong multilingual capability, including Chinese, Japanese, Korean, and European languages. Qwen2.5-Coder-32B is a strong coding-specific model.

**License:** Apache 2.0 (most sizes). Verify per-model.

### Phi (Microsoft)

Small, efficient models (Phi-3, Phi-4 family). 3.8B to 14B parameters. Designed to punch above their weight class for reasoning tasks. Run comfortably on consumer hardware or edge devices.

**License:** MIT.

### Nemotron (NVIDIA)

Optimized for NVIDIA hardware (H100, A100, B200). Available in multiple sizes. Designed for throughput on NVIDIA DGX stacks using NeMo framework. Strong at instruction following and reasoning when running on native hardware.

**License:** NVIDIA Open Model License. Review terms before commercial deployment.

### gpt-oss (OpenAI)

OpenAI's open-source release. Strong general capabilities with OpenAI-style API behavior. Available via Foundry catalog and as downloadable weights (verify current distribution channels). Useful when you want open-weight reproducibility with OpenAI training lineage.

**License:** Verify current license — OpenAI's open release terms have varied across releases.

---

## Runtime options

| Runtime | Best for | Notes |
|---|---|---|
| **Ollama** | Easiest local setup; single-command model management | `ollama pull llama3.3:70b`, then `ollama run`. OpenAI-compatible API on localhost:11434. Cross-platform. Start here. |
| **llama.cpp** | CPU inference; quantized models on consumer hardware | Quantized (GGUF) models run on CPU or mixed CPU/GPU. Slower than GPU-only but runs on laptops. |
| **vLLM** | High-throughput production serving | Continuous batching, high GPU utilization, OpenAI-compatible API. Use for internal API serving with multiple concurrent users. |
| **NemoClaw** | NVIDIA DGX stack, Nemotron models | NVIDIA-specific; integrates with NeMo framework. Use only if you have DGX hardware. |

---

## When to run locally

| Scenario | Run locally | Why |
|---|---|---|
| Data that cannot leave your network (PII, secrets, regulated data) | Yes | Weights on your hardware = zero external calls |
| Offline development environment (air-gapped, no internet) | Yes | No API dependency |
| Cost at scale (high request volume, predictable load) | Sometimes | Hardware + electricity vs. API cost; break-even depends on volume and model size |
| One-off experimentation with a model | No | Use Foundry catalog or a free API tier — no hardware setup required |
| You need frontier-level quality | No | Open-weight quality ceiling is below GPT-5.5 / Opus 4.7 for complex reasoning tasks |
| Latency SLA < 1 second | Depends | Depends entirely on your hardware; don't assume local = fast |

---

## Trade-offs vs. frontier models

| Dimension | Open-weight local | Frontier API |
|---|---|---|
| **Quality ceiling** | Lower — best open-weight models trail frontier on complex reasoning, long-context, and agentic tasks | Higher — Opus 4.7, GPT-5.5, Gemini Ultra set the ceiling |
| **Data residency** | Complete control | Data leaves your network |
| **Cost at scale** | Hardware + electricity (fixed) | Per-token (linear with volume) |
| **Operational overhead** | High — you manage hardware, software, updates, scaling | None — provider manages everything |
| **Model updates** | Manual — you pull new weights, test, redeploy | Automatic (sometimes breaking) or versioned |
| **Context window** | Varies by model; typically 8K–128K; some larger | Up to 1M (Opus 4.7); Gemini higher |
| **Multimodal** | Available in some models (Llama-4, Qwen) | Broad support across frontier models |

---

## Getting started with Ollama

```bash
# Install Ollama (macOS/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama3.3:70b    # 70B — needs significant RAM/VRAM
ollama pull deepseek-r1:7b  # 7B — runs on a laptop

# Run interactively
ollama run deepseek-r1:7b

# Use the OpenAI-compatible API
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-r1:7b", "messages": [{"role": "user", "content": "[PROMPT]"}]}'
```

Any tool that accepts an OpenAI-compatible endpoint (Cline, OpenCode, Aider with `--openai-api-base`) can route to a local Ollama instance.

---

## Hardware requirements (approximate)

| Model | VRAM needed | Minimum practical setup |
|---|---|---|
| 7B (Mistral, Phi-3, Qwen2.5-7B) | ~8GB | Single consumer GPU (RTX 4070+) or Apple Silicon M2+ |
| 14B (Phi-4, Qwen2.5-14B) | ~16GB | RTX 4080, M2 Pro 16GB+ |
| 32B (Qwen2.5-32B, DeepSeek-R1-32B) | ~24GB | RTX 4090, or 2× 16GB GPUs |
| 70B (Llama-3.3-70B) | ~48GB | 2× 24GB GPUs, or 4× 16GB GPUs |
| 671B MoE (DeepSeek-V3, DeepSeek-R1) | ~80–160GB (active layers only) | Multi-GPU server; not practical on consumer hardware without heavy quantization |

Quantization (Q4, Q5, Q8) reduces VRAM requirements at a quality cost. Q4 typically has minimal quality degradation on instruction-following tasks; avoid Q2 for anything quality-sensitive.

---

## Related

- `docs/models/foundry-other.md` — same open-weight models via Azure Foundry (no local hardware required)
- `docs/decisions/model-routing.md` — when to use local vs. API
- `MODELS.md` — routing matrix including local Ollama path

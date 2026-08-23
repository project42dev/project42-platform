# 6 Focus Areas Expansive AI Curriculum Matrix — Complete Technical Specification

**Document ID:** `SPEC-CURR-001`  
**Version:** `1.0.0`  
**Epic Reference:** `AB#5112` / `PLAN-CURR-001`  
**Standard:** Project 42 Open-Source Curriculum Framework  

---

## 1. Executive Overview & Pedagogical Philosophy

The modern Artificial Intelligence landscape has evolved far beyond basic prompt engineering and chatbot wrappers. To build, deploy, and govern production-grade AI systems, practitioners require a deep, multi-disciplinary understanding that spans probabilistic reasoning, software engineering patterns, autonomous agent loops, retrieval systems, hardware infrastructure, and security red-teaming.

The **Project 42 6-Domain Expansive AI Matrix** establishes a provider-neutral, verifiable, and host-agnostic curriculum standard. Every concept is grounded in deterministic code contracts, reproducible lab exercises, and verifiable evidence checkpoints.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROJECT 42 6-DOMAIN AI MATRIX                         │
├────────────────────┬────────────────────┬───────────────────────────────┤
│ Domain 1: Literacy │ Domain 2: Dev AI   │ Domain 3: Agentic Systems     │
│ & Mental Models    │ & Structured Code  │ & Model Context Protocol      │
├────────────────────┼────────────────────┼───────────────────────────────┤
│ Domain 4: RAG &    │ Domain 5: Open-    │ Domain 6: AI Security,        │
│ Fine-Tuning Eng.   │ Weight & AIOps     │ Red-Teaming & Governance      │
└────────────────────┴────────────────────┴───────────────────────────────┘
                                   │
                                   ▼ [Future Expansion Headroom]
┌────────────────────┬────────────────────┬───────────────────────────────┤
│ Domain 7: Robotics │ Domain 8: Vertical │ Domain 9: Frontier Science    │
│ & Physical AI      │ Industry Solutions │ & Quantum Computing           │
└────────────────────┴────────────────────┴───────────────────────────────┘
```

---

## 2. Domain Detailed Specifications

### Domain 1: AI Literacy & Mental Models for Professionals
**Path ID:** `ai-literacy-and-mental-models`  
**Target Audience:** Software engineers, product managers, technical leaders, and AI practitioners.  
**Core Thesis:** AI systems are non-deterministic, probabilistic token prediction engines. Effective collaboration requires understanding stochastic generation, token economics, and reasoning failure modes.

#### Key Modules & Learning Outcomes
1. **Mental Models: Probabilistic Intelligence (`ai-mental-models`)**
   - *Core Concepts:* Autoregressive token generation, next-token probability distributions, temperature vs top-p sampling, and stochastic vs deterministic computing.
   - *Hands-On Evidence:* Formulate queries demonstrating how decoding parameters alter token diversity and predictability.
2. **Prompt Architecture & Structured Deliberation (`prompt-architecture`)**
   - *Core Concepts:* System prompts as policy boundaries, few-shot demonstration in-context learning, Chain-of-Thought (CoT), Tree of Thoughts (ToT), and structured deliberation chains.
   - *Hands-On Evidence:* Build a verifiable reasoning prompt with strict step-by-step verification gates.
3. **Token Economics, Context Windows & Limits (`token-economics-and-limits`)**
   - *Core Concepts:* Byte-Pair Encoding (BPE), token-to-cost conversion math, context window attention degradation ("needle in a haystack"), context caching, and hallucination taxonomy.
   - *Hands-On Evidence:* Calculate exact token budgets and costs across multiple context lengths and model tiers.

---

### Domain 2: Developer & Practitioner AI Engineering
**Path ID:** `developer-and-practitioner-ai`  
**Target Audience:** Full-stack developers, backend engineers, and software architects building AI applications.  
**Core Thesis:** Production AI applications require guaranteed type-safety, structured JSON outputs, streaming UX, and robust vector search.

#### Key Modules & Learning Outcomes
1. **Unified Multi-Provider SDK Patterns (`provider-sdk-patterns`)**
   - *Core Concepts:* Provider-neutral client abstraction, handling disparate payload schemas (OpenAI, Anthropic, Google Gemini, Mistral), retries with exponential backoff, and rate limit handling.
   - *Hands-On Evidence:* Implement an abstract TypeScript/Python client that fails over gracefully across provider endpoints.
2. **Guaranteed Structured Outputs & Schemas (`structured-outputs-mastery`)**
   - *Core Concepts:* Constrained token decoding, JSON Schema mode, schema validation with Zod / Pydantic, and self-correcting schema retry loops.
   - *Hands-On Evidence:* Extract complex relational entities into strictly validated TypeScript types with zero malformed JSON errors.
3. **Function Calling, SQL Tools & API Bridges (`function-calling-and-tools`)**
   - *Core Concepts:* Declaring tool parameters, multi-turn tool execution loops, read-only vs mutating tool boundaries, and parameterized SQL query execution.
   - *Hands-On Evidence:* Implement a secure database querying tool with parameterized filters and error propagation.
4. **Semantic Embeddings & Vector Databases (`vector-embeddings-and-pgvector`)**
   - *Core Concepts:* High-dimensional vector geometry, cosine similarity vs dot product vs euclidean distance, HNSW indexing, and production deployment with `pgvector` and Qdrant.
   - *Hands-On Evidence:* Ingest, index, and query a semantic document collection using PostgreSQL `pgvector`.

---

### Domain 3: Frontier Agentic Systems & Model Context Protocol (MCP)
**Path ID:** `agentic-systems-and-mcp`  
**Target Audience:** Senior developers, system architects, and autonomous software engineers.  
**Core Thesis:** Agents extend models from passive responders into active, stateful problem solvers via autonomous loops, typed tool protocols (MCP), and multi-agent coordination.

#### Key Modules & Learning Outcomes
1. **The Agent Spectrum: ReAct to Autonomous Loops (`agent-architecture-spectrum`)**
   - *Core Concepts:* Single-turn tool calling vs Reason + Act (ReAct) execution loops, plan-and-solve workflows, reflection/self-critique, and state checkpoints.
   - *Hands-On Evidence:* Implement a stateful ReAct agent loop with execution trace logging and max-step recursion termination.
2. **Model Context Protocol (MCP) Architecture (`model-context-protocol-mcp`)**
   - *Core Concepts:* Anthropic open standard for tool integration, Host-Client-Server JSON-RPC protocol, STDIO vs SSE transports, MCP resource management, and prompts.
   - *Hands-On Evidence:* Build and run a custom STDIO MCP Server exposing system diagnostics to an AI coding assistant.
3. **Multi-Agent Orchestration & Consensus (`multi-agent-orchestration`)**
   - *Core Concepts:* Hierarchical supervisor models, peer-to-peer handoffs, swarm routing, consensus voting, and deterministic orchestration using LangGraph / CrewAI.
   - *Hands-On Evidence:* Orchestrate a two-agent workflow (Researcher Agent + Reviewer Agent) with explicit handoff contracts.
4. **Human-in-the-Loop & Spend Brake Safeguards (`agent-safety-and-spend-brakes`)**
   - *Core Concepts:* Asynchronous approval gates, spend limits, token budgets, recursion depth limits, tool permission rings, and cryptographic audit receipts.
   - *Hands-On Evidence:* Configure an interactive approval interrupt before executing destructive file system or cloud mutations.

---

### Domain 4: Retrieval, RAG & Fine-Tuning Engineering
**Path ID:** `rag-and-fine-tuning-engineering`  
**Target Audience:** ML engineers, data platform engineers, and enterprise search specialists.  
**Core Thesis:** Augmenting model capability requires selecting the right strategy between prompt context, hybrid retrieval, knowledge graphs, and parameter fine-tuning.

#### Key Modules & Learning Outcomes
1. **Hybrid Search (BM25 + Dense) & Re-ranking (`advanced-rag-and-hybrid-search`)**
   - *Core Concepts:* Reciprocal Rank Fusion (RRF), combining sparse keyword matching (BM25) with dense embeddings, cross-encoder re-rankers (Cohere, BGE), and semantic chunking.
   - *Hands-On Evidence:* Build a hybrid retrieval pipeline and demonstrate improved NDCG@10 over pure vector search.
2. **GraphRAG & Multi-Hop Entity Reasoning (`graph-rag-and-knowledge-graphs`)**
   - *Core Concepts:* Knowledge graph extraction from unstructured text, entity-relation linking, community detection (Leiden algorithm), and multi-hop document synthesis.
   - *Hands-On Evidence:* Query a connected entity graph to answer cross-document relational questions that fail in naive RAG.
3. **Instruction Fine-Tuning with LoRA & QLoRA (`lora-qlora-fine-tuning`)**
   - *Core Concepts:* Parameter-Efficient Fine-Tuning (PEFT), Low-Rank Adaptation (LoRA rank $r$ and $\alpha$), 4-bit NormalFloat (NF4) QLoRA, gradient checkpointing, and loss curves.
   - *Hands-On Evidence:* Configure a QLoRA fine-tuning script for a domain task and analyze training loss convergence.
4. **Direct Preference Optimization (DPO) & Model Evaluation (`dpo-and-model-evaluation`)**
   - *Core Concepts:* Reinforcement Learning from Human Feedback (RLHF) vs DPO, synthetic preference dataset curation (`chosen` vs `rejected`), and LLM-as-a-Judge evaluation rubrics.
   - *Hands-On Evidence:* Evaluate model outputs using automated G-Eval / Ragas criteria with statistical confidence intervals.

---

### Domain 5: Self-Hosted, Open-Weight & Enterprise AIOps
**Path ID:** `self-hosted-and-aiops`  
**Target Audience:** DevOps engineers, Site Reliability Engineers (SREs), infrastructure architects, and air-gapped system operators.  
**Core Thesis:** Operating private models provides complete data privacy, zero vendor lock-in, and predictable economics when paired with proper hardware planning, high-throughput serving, and observability.

#### Key Modules & Learning Outcomes
1. **The Open-Weight Ecosystem & Quantization (`open-weights-and-quantization`)**
   - *Core Concepts:* Open-weight landscape (Meta Llama 3, DeepSeek V3, Mistral, Qwen 2.5), weight formats (Safetensors, GGUF, AWQ, GPTQ), and quantization accuracy trade-offs.
   - *Hands-On Evidence:* Quantize an FP16 model checkpoint to GGUF Q4_K_M and benchmark memory footprint vs perplexity.
2. **GPU Sizing, VRAM Planning & KV Cache (`hardware-and-vram-calculator`)**
   - *Core Concepts:* Memory allocation math ($M = \frac{P \times B}{8} \times 1.2$), KV Cache memory scaling ($2 \times L \times H \times D \times T \times B$), tensor parallelism across multi-GPU nodes.
   - *Hands-On Evidence:* Calculate exact GPU VRAM and bandwidth requirements for serving 70B models at 4K context.
3. **High-Throughput Serving with vLLM & Ollama (`production-vllm-and-ollama`)**
   - *Core Concepts:* PagedAttention memory management, continuous batching, chunked prefill, OpenAI-compatible REST APIs, and air-gapped Docker Compose deployment.
   - *Hands-On Evidence:* Deploy a local vLLM container serving an open-weight model with streaming responses and load testing.
4. **Semantic Caching, Fallbacks & OpenTelemetry AI Tracing (`semantic-caching-and-ai-tracing`)**
   - *Core Concepts:* Redis vector semantic caching for prompt deduplication, multi-provider fallback cascades, rate limiting, and OpenTelemetry distributed tracing (OTel GenAI Semantic Conventions).
   - *Hands-On Evidence:* Trace an LLM application transaction across cache hits, token latency histograms, and fallback events.

---

### Domain 6: AI Security, Red-Teaming & Enterprise Governance
**Path ID:** `ai-security-and-governance`  
**Target Audience:** Information security officers (CISOs), application security engineers, compliance auditors, and safety engineers.  
**Core Thesis:** Autonomous and generative systems introduce unique attack vectors (prompt injection, tool hijacking, data poisoning) that require defense-in-depth, runtime guardrails, sandboxing, and verifiable compliance receipts.

#### Key Modules & Learning Outcomes
1. **OWASP Top 10 for LLMs & Red-Teaming (`owasp-top-10-llm-attacks`)**
   - *Core Concepts:* Direct prompt injection (jailbreaks), indirect prompt injection via untrusted data retrieval, data exfiltration via image markdown rendering, and excessive agency.
   - *Hands-On Evidence:* Execute controlled red-team test cases against vulnerable agent prompts and implement input boundary mitigations.
2. **Agent Guardrails, NeMo & Code Sandboxing (`guardrails-and-sandboxing`)**
   - *Core Concepts:* Programmable guardrail architectures (Llama Guard, NeMo Guardrails), input/output token filtering, and isolating generated code execution in WebAssembly (WASM) or MicroVM sandboxes (gVisor/Firecracker).
   - *Hands-On Evidence:* Enforce a runtime guardrail intercepting PII leaks and unapproved bash command executions.
3. **EU AI Act, NIST AI RMF & Deletion Receipts (`ai-compliance-and-crypto-receipts`)**
   - *Core Concepts:* EU AI Act risk tiers (Unacceptable, High, General Purpose), NIST AI Risk Management Framework, verifiable audit trails, and cryptographic HMAC learner deletion receipts.
   - *Hands-On Evidence:* Verify a tamper-proof cryptographic audit log for user consent and data deletion compliance.

---

## 3. Extensible Backlog: Future Domains 7, 8, and 9

The Project 42 curriculum schema is designed with forward-compatible taxonomies to accommodate emerging AI frontiers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ROADMAP EXPANSION DOMAINS                           │
├─────────────────────────────────────────────────────────────────────────┤
│ Domain 7: Physical AI, Robotics & Embodied Intelligence                 │
│ • Robot Operating System (ROS 2) integration & Isaac Sim               │
│ • Vision-Language-Action (VLA) models (RT-2, OpenVLA, Octo)             │
│ • Spatial reasoning, point clouds, and real-time sensor loops           │
├─────────────────────────────────────────────────────────────────────────┤
│ Domain 8: Vertical Industry AI Solutions                                │
│ • Healthcare & Clinical AI: HIPAA-compliant RAG, DICOM imaging, EHRs    │
│ • Legal & Compliance AI: Case law graph reasoning, contract diffing     │
│ • Quantitative Finance: Market signal extraction, algorithmic safety    │
├─────────────────────────────────────────────────────────────────────────┤
│ Domain 9: Frontier Science & Quantum Computing                          │
│ • Quantum Machine Learning (QML) & Parameterized Quantum Circuits       │
│ • Protein folding, molecular docking & computational biology (AlphaFold)│
│ • Neuromorphic computing & spiking neural network architectures         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Assessment Methodology & Verification Criteria

All 6 domains enforce strict, evidence-based completion standards:
- **80% Minimum Passing Score** on all structured knowledge checks with distractor explanations.
- **Evidence-Based Activities**: Every lab requires tangible output verification (e.g., matching deterministic schemas, passing unit assertions, capturing cryptographic hashes).
- **Badge Credentials**: Path completion automatically issues device-local, verifiable badges based on the open standard.

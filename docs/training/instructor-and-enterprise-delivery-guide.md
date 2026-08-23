# 6 Focus Areas AI Matrix — Instructor & Enterprise Delivery Guide

**Document ID:** `GUIDE-INST-001`  
**Version:** `1.0.0`  
**Epic Reference:** `AB#5112` / `AB#8201`–`AB#8207`  
**Target Audience:** Enterprise training coordinators, technical workshop leaders, university professors, and self-hosted platform operators.  

---

## 1. Delivery Architecture

The Project 42 curriculum is organized into **6 Focus Areas** and built to support flexible delivery formats across both the self-paced (`/learn`) and virtual instructor (`/ondemand`) surfaces:
- **Asynchronous Self-Paced Learning:** Learners progress through interactive lessons, quizzes, and local evidence captures with zero server lock-in.
- **Instructor-Led Live Workshops:** Facilitators use structured lesson plans, timed live demonstrations, guided pauses, and checkpoint discussions.
- **Corporate Private Overlays:** Organizations inject custom proprietary content, internal SDKs, and compliance rules on top of the open standard.

---

## 2. Enterprise Custom Content Overlay Injection

Enterprises can overlay proprietary modules and paths without modifying core Project 42 open-source files:

```
project42-deployment/
├── platform/                 # Canonical Project 42 Platform
└── custom-content/           # Enterprise Proprietary Overlay
    ├── catalog.overlay.json  # Additional paths (e.g., "Internal Corp AI Governance")
    └── modules/              # Custom module JSON files
        └── corp-security/
            └── internal-api-key-vault.json
```

### Configuration:
Set the environment variable in Docker Compose or Kubernetes:
```yaml
environment:
  PROJECT42_CONTENT_DIR: /app/content
  PROJECT42_CUSTOM_CONTENT_DIR: /app/custom-content
```
The platform automatically reconciles and merges the catalogs on startup with zero downtime.

---

## 3. Workshop Pacing & Timetable (Sample 3-Day Intensive)

```
┌────────────────────────────────────────────────────────────────────────┐
│               3-DAY ENTERPRISE AI ACCELERATOR SCHEDULE                 │
├───────────────┬────────────────────────────────────────────────────────┤
│ Day 1         │ Foundations, Prompt Architecture & Structured Dev AI   │
│ (Domains 1-2) │ • Autoregressive token math & BPE encoding             │
│               │ • Multi-provider SDK abstractions in TypeScript/Python │
│               │ • Zod structured JSON schemas & function calling labs  │
├───────────────┼────────────────────────────────────────────────────────┤
│ Day 2         │ Frontier Agents, MCP & Advanced Retrieval Engineering  │
│ (Domains 3-4) │ • Building custom Model Context Protocol (MCP) servers │
│               │ • Multi-agent supervisor handoffs (LangGraph)          │
│               │ • Hybrid vector + BM25 search & GraphRAG extraction    │
├───────────────┼────────────────────────────────────────────────────────┤
│ Day 3         │ Open-Weight AIOps, Quantization & Security Red-Teaming │
│ (Domains 5-6) │ • GPU VRAM sizing math & local vLLM / Ollama serving   │
│               │ • OWASP LLM prompt injection & sandboxing defenses     │
│               │ • Cryptographic audit receipts & EU AI Act compliance  │
└───────────────┴────────────────────────────────────────────────────────┘
```

---

## 4. Assessment Rubrics & Grading Standard

Every module in the 6-Domain Matrix includes three deterministic grading checkpoints:
1. **Interactive Knowledge Check:** 80% passing threshold with detailed distractor rationale for incorrect options.
2. **Deterministic Evidence Check:** Automated JSON schema validation on activity output payloads.
3. **Open Reflection Prompt:** Synthesis questions designed for group breakout discussions or peer code reviews.

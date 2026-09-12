// The known Focus Areas, shared by /learn/paths and /ondemand (and by
// tests/learning-path-reachability.test.mjs, which imports this file
// directly rather than mirroring it, so the two can't drift apart the way
// the two pages' copies of this same array did before this fix).
//
// This is platform/site-authored display metadata, not curriculum. No
// project42-content catalogue -- the platform's own bundled content
// included -- declares a `focusArea` on any path or a catalogue-level
// `focusAreas` array (both fields exist in the schema; neither is
// populated anywhere today). Until a content repository sets
// `path.focusArea` to one of the ids below, `groupPathsByFocusArea` (see
// ./focusAreaGroups.ts) places every path in the fallback group instead of
// under one of these -- which is correct, not a bug: it's what "grouped by
// focus area when set, fallback when not" means when nothing is set yet.
import type { FocusAreaDefinition } from "./focusAreaGroups";

export const defaultFocusAreas: FocusAreaDefinition[] = [
  { id: "ai-literacy-and-foundations", number: 1, title: "AI Literacy & Foundations", summary: "Core mental models, language model generation, prompt anatomy, context tokens, verification, and privacy without assuming technical experience." },
  { id: "developer-and-practitioner-ai", number: 2, title: "Developer & Practitioner AI", summary: "Provider-neutral evaluation, capability comparison, structured outputs, function calling, and hands-on practice across Anthropic, OpenAI, and Google Gemini." },
  { id: "frontier-agentic-systems-and-mcp", number: 3, title: "Frontier Agentic Systems & MCP", summary: "Bounded agent loops, tool authority, memory boundaries, Model Context Protocol (MCP) architecture, multi-agent handoffs, and scored capstone." },
  { id: "retrieval-rag-and-fine-tuning", number: 4, title: "Retrieval, RAG & Fine-Tuning", summary: "Advanced retrieval architectures, hybrid search, embedding stores, knowledge graphs, and LoRA/QLoRA fine-tuning." },
  { id: "self-hosted-and-aiops", number: 5, title: "Self-Hosted, Open-Weight & AIOps", summary: "Open-weight model selection, vLLM/Ollama serving, VRAM calculations, artifact integrity, endpoint security, and disaster recovery." },
  { id: "ai-security-and-governance", number: 6, title: "AI Security, Red-Teaming & Governance", summary: "OWASP Top 10 for LLMs, sandboxing, guardrails, compliance frameworks, and cryptographic audit receipts." },
];

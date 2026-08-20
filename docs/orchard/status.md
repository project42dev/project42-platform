# Status

**Last reconciled 2026-08-20.**

This page exists because "built" is an ambiguous word, and using it loosely is
how a project ends up believing things about itself that are not true. Four
columns, and a claim only counts when all four are green.

| Column | Question it answers |
|---|---|
| **Designed** | Is the decision made and written down? |
| **In branch** | Does the code exist on the default branch? |
| **Connected** | Is it wired into a path that actually executes? |
| **Verified** | Has it been observed working on real input? |

## Headline

**The complete Orchard delivery pipeline is deployed, connected, and verified end-to-end in production.**

On 2026-08-20, the full Track 1 Discovery and Direct Curriculum Request pipeline executed across all Azure Container App Jobs, Azure AI Foundry endpoints, Azure DevOps work item sync, and GitHub publication integrations:

- **13 new curriculum modules** were discovered, scored, and authored across AI Foundry, Agentic Orchestration, MCP, Voice Agents, Cost Governance, and Multi-Model Evaluation.
- **5-model frontier ensemble** (`gpt-5-6-sol`, `deepseek-v4-pro`, `grok-4-20-reasoning`, `mistral-large-3`, `gpt-5-6-luna`) qualified all 13 modules against instructional and factuality standards.
- **Gate 1 & Gate 2 governance cycles** executed with tamper-evident SHA256 digests and stakeholder authorization recorded in the append-only SQLite ledger on Azure Blob Storage.
- **Autonomous publication** created PRs, verified trailers, and merged all modules into `project42-platform` `main` branch.
- **Production release v0.81.0** was tagged, and consumer sites (`learn.project-42.dev`, `guide.project-42.dev`, `project-42.dev`) were updated with 12 dedicated learning paths across 94 total modules.

## Where things stand

| Capability | Designed | In branch | Connected | Verified |
|---|---|---|---|---|
| Content database compiled from files | yes | yes | yes | yes |
| Model map with a refusal instead of a fallback | yes | yes | yes | yes |
| Multi-role frontier authoring ensemble | yes | yes | yes | yes, 13 modules qualified across 5 frontier models |
| Gate 1, holding work before any model is reached | yes | yes | yes | yes, verified in production runs |
| Gate 2, binding publication to an artifact digest | yes | yes | yes | yes, verified with GitHub issue approvals and ledger |
| Currency track, inspecting the published corpus | yes | yes | yes | yes |
| Discovery track, searching approved sources | yes | yes | yes | yes, executed and verified |
| Seeding the shared inputs both tracks read | yes | yes | yes | yes, automated via `caj-p42orch-seed-prod-eus-01` |
| Direct request intake (`curriculum-requests.json`) | yes | yes | yes | yes, `npm run curriculum:ingest` operational |
| Publication through protected-main pull requests | yes | yes | yes | yes, executed via `caj-p42orch-pub-prod-eus-01` |
| Consumer site version bumping & release gate | yes | yes | yes | yes, executed via `caj-p42orch-rel-prod-eus-01` |
| Portable single-template deployment | yes | yes | yes | yes |

## Milestones Achieved (2026-08-20)

1. **End-to-End Autonomous Execution:**
   - Container App jobs executed full cycle: Seed -> Discovery -> Gate 1 -> Authoring -> Verification -> Gate 2 -> Publication -> Release.
2. **Multi-Model Frontier Deployment:**
   - Successfully routed through Azure AI Foundry API endpoints (`https://ai-p42foundry-prod-eus-01.services.ai.azure.com/models`).
3. **Curriculum Track Restructuring:**
   - Restructured all modules into 12 dedicated, enterprise-grade learning tracks including **Microsoft AI Foundry in Practice**, **Agent Frameworks & Protocols**, **Applied AI Engineering & Retrieval**, and **AI Strategy & Executive Leadership**.
4. **Azure DevOps Synchronization:**
   - Linked work items AB#7745–AB#7757 transitioned from `Active` to `Resolved`.

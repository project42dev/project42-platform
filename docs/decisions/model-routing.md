# Model Routing — Worked Examples

**Last verified:** 2026-04-28

Five worked examples showing how to route a task through the model stack: which workstream, which model at each stage, and why. This extends `MODELS.md` and `decisions/model-routing.md` with concrete scenarios rather than abstract rules.

---

## How to read these examples

Each example follows this structure:

- **Task** — what was asked
- **Workstream** — which workstream type handles this (coder, reviewer, documenter, investigator, operator)
- **Model at each stage** — the model choice and why
- **Estimated tokens** — rough budget; these are estimates, not guarantees

Token estimates use these baselines: 1 token ≈ 4 characters; a 100-line function ≈ 1,500 tokens; a 1,000-line file ≈ 15,000 tokens.

---

## Example 1: Add a login endpoint to an Express app

**Task:** "Add a POST /auth/login endpoint to this Express app. It should validate credentials against the users table, issue a JWT, and return 401 on failure."

| Stage | Workstream | Model | Rationale |
|---|---|---|---|
| Coder | coder | Claude Sonnet 4.6 via Claude Code | Standard feature addition in a known framework; Sonnet handles this without Opus escalation |
| Reviewer | reviewer | GPT-5.4 via Foundry | Cross-family rule: coder is Claude, reviewer must be a different family; GPT-5.4 is the default cross-family reviewer |

**Routing detail:**

- Sonnet 4.6 reads the existing `routes/`, `models/`, and `middleware/` directories to understand the app structure, then writes the endpoint and any needed middleware.
- The reviewer (GPT-5.4) gets the diff plus the surrounding auth context. It checks for JWT signing key exposure, missing input validation, timing attacks on credential comparison, and whether the 401 response leaks username-existence information.
- No Opus escalation needed: the task is well-scoped, the codebase is familiar, and there is no architectural ambiguity.

**Estimated tokens:**

| Stage | Input | Output | Total |
|---|---|---|---|
| Coder (Sonnet 4.6) | ~12K (existing files) | ~3K (new endpoint + tests) | ~15K |
| Reviewer (GPT-5.4) | ~8K (diff + context) | ~2K (review comments) | ~10K |
| **Total** | | | **~25K** |

---

## Example 2: Review a PR that touches the auth module

**Task:** "Review PR #47. It refactors the auth module to support OAuth 2.0 in addition to the existing username/password flow."

| Stage | Workstream | Model | Rationale |
|---|---|---|---|
| Reviewer | reviewer | GPT-5.4 (Foundry) or Gemini (fallback) | Cross-family review; auth changes are high-stakes — use the strongest cross-family option available |

**Why auto-upgrade to the full reviewer workstream:**

Auth module changes carry disproportionate risk. A mistake in the authentication flow can expose the entire application. The reviewer workstream runs a structured checklist: OWASP Top 10 auth failures, token lifecycle (issuance, expiry, revocation), state parameter handling in OAuth flows, redirect URI validation, and PKCE enforcement.

Sonnet or Haiku are not appropriate here regardless of model family. This is a case where the reviewer should run at full depth, not abbreviated. If GPT-5.4 is unavailable in your Foundry region, fall back to Gemini Pro (not Flash — use the full tier for security review). Do not use Claude for this review: the coder is assumed to be Claude.

**Estimated tokens:**

| Stage | Input | Output | Total |
|---|---|---|---|
| Reviewer (GPT-5.4) | ~20K (full PR diff + auth module context) | ~5K (structured review) | ~25K |

**Escalation trigger:** If the PR also touches the session management layer or changes how tokens are stored, escalate the reviewer to GPT-5.5 for deeper long-context coherence across both modules.

---

## Example 3: Refactor a 2,000-line service into smaller modules

**Task:** "The `UserService` class is 2,000 lines. Break it into domain-specific modules: UserProfileService, UserAuthService, UserNotificationService, and UserPreferencesService. Maintain all existing public interfaces."

| Stage | Workstream | Model | Rationale |
|---|---|---|---|
| Planner | planner | Claude Opus 4.7 | 2,000 lines; cross-cutting concerns; architectural decisions about interface boundaries — this is exactly what Opus is for |
| Coder (per module) | coder | Claude Sonnet 4.6 via Claude Code | Once the plan is clear, execution is Sonnet-level work; run in parallel subagents per module |
| Reviewer | reviewer | GPT-5.4 via Foundry | Cross-family; checks that all public interfaces are preserved and no callers are broken |

**Model at each stage:**

1. **Planner (Opus 4.7):** Reads the full 2,000-line file and all callers (imports, controller files). Produces a module boundary plan: which methods go where, which shared state needs extraction, which interfaces must remain unchanged. Outputs a structured plan the coder agents consume.

2. **Coder (Sonnet 4.6, parallel):** Four subagents, one per target module, each working from the planner's boundary spec. Each reads only the methods it owns plus the shared state spec. Writes the new module file and updates the import in the original file.

3. **Reviewer (GPT-5.4):** Reviews the combined diff. Specifically checks: no method moved to the wrong module, no public interface changed, no circular imports introduced, shared state (e.g., database connection, logger) handled correctly.

**Estimated tokens:**

| Stage | Input | Output | Total |
|---|---|---|---|
| Planner (Opus 4.7) | ~35K (full file + callers) | ~5K (plan) | ~40K |
| Coder ×4 (Sonnet 4.6, parallel) | ~10K each (scoped context) | ~8K each | ~72K |
| Reviewer (GPT-5.4) | ~30K (full diff + interface specs) | ~4K | ~34K |
| **Total** | | | **~146K** |

**Why not Opus for all stages:** Opus is expensive and slow. The planner stage justifies it — architectural boundary decisions are hard to recover from if wrong. The coding stage is mechanical execution of a clear spec: Sonnet is appropriate and running it in parallel cuts wall-clock time.

---

## Example 4: Generate API documentation from code

**Task:** "Generate OpenAPI 3.1 documentation for the payment service. Source is the route handlers and TypeScript interfaces."

| Stage | Workstream | Model | Rationale |
|---|---|---|---|
| Documenter | documenter | Claude Sonnet 4.6 via Anthropic API | Structured output task; predictable input format; Sonnet is the correct cost/quality choice here |

**Why Sonnet over Opus:**

Documentation generation from code is a transformation task, not a reasoning task. The model reads TypeScript interfaces and route handlers, maps them to OpenAPI schema objects, and writes YAML. The structure is deterministic. Opus adds cost and latency without a quality improvement on this task class. Sonnet's output is reliable and fast enough for a documentation pipeline.

**Why API over Claude Code:**

This is a batch documentation job, not an interactive coding session. Triggering it via the Anthropic API (a script or CI step) is appropriate: it runs on demand, the output goes directly to a file or PR, and there is no benefit to Claude Code's interactive loop here.

**Routing detail:**

- Input: route handler files, TypeScript interface files, existing OpenAPI skeleton (if any).
- Output: complete `openapi.yaml` with paths, request bodies, response schemas, and security definitions.
- If the service has more than ~80 endpoints and the file total exceeds 100K tokens, split by domain (auth routes, payment routes, admin routes) and merge the output.

**Estimated tokens:**

| Stage | Input | Output | Total |
|---|---|---|---|
| Documenter (Sonnet 4.6) | ~20K (route handlers + interfaces) | ~8K (OpenAPI YAML) | ~28K |

**Escalation trigger:** If the TypeScript types are complex (generics, conditional types, discriminated unions) and Sonnet generates incorrect schemas for them, escalate one targeted prompt to Opus 4.7 for those specific types only.

---

## Example 5: Root-cause a production memory leak

**Task:** "The Node.js API server is leaking memory — heap grows by ~50MB/hour under normal load and the process restarts every 6–8 hours. Root-cause it."

| Stage | Workstream | Model | Rationale |
|---|---|---|---|
| Investigator | investigator | Claude Opus 4.7 | Complex debugging across multiple system layers; long-range reasoning across logs, heap snapshots, and code — this is a hard reasoning task |

**Why Opus:**

Memory leak investigation is non-linear. The investigator must reason across: heap snapshots (which objects are growing), call stacks (which code paths create them), event loop behavior (are listeners accumulating?), and middleware chains (are request objects being retained?). Sonnet can handle individual subquestions, but maintaining coherence across all evidence sources as new information arrives is where Opus earns its cost.

**What the investigator outputs:**

The investigate workstream produces a structured report, not a fix:

1. **Hypothesis list:** ranked by likelihood, with evidence for each (e.g., "HTTP keep-alive connections not being closed — seen in heap snapshot: 4,000 Socket objects with no GC root").
2. **Reproduction steps:** a minimal script or load test that triggers the leak.
3. **Recommended fix per hypothesis:** code-level change for each, with token of confidence.
4. **Next step:** which hypothesis to validate first, and how.

The coder workstream (Sonnet 4.6) implements the fix once the investigator hands off the root cause.

**Routing detail:**

- Provide: heap snapshots (summarized — not raw JSON, which is too large), APM metrics (requests/sec, heap used, GC pause times), recent code changes near the suspected leak area, and relevant middleware or library versions.
- If heap snapshots exceed 50K tokens even summarized, extract only the top-N retained object types and their reference chains.

**Estimated tokens:**

| Stage | Input | Output | Total |
|---|---|---|---|
| Investigator (Opus 4.7) | ~40K (snapshots summary + logs + code) | ~6K (structured report) | ~46K |
| Coder (Sonnet 4.6, after handoff) | ~15K (report + relevant files) | ~4K (fix) | ~19K |
| Reviewer (GPT-5.4) | ~10K (diff + context) | ~2K | ~12K |
| **Total** | | | **~77K** |

**Escalation trigger:** If the leak persists after the first fix, start the investigator again with the new heap snapshot plus the failed fix. Do not assume the first hypothesis was right — the investigator should revisit the full evidence set.

---

## Summary table

| Example | Primary workstream | Coder model | Reviewer model | Approx. total tokens |
|---|---|---|---|---|
| 1. Add login endpoint | coder → reviewer | Sonnet 4.6 | GPT-5.4 | ~25K |
| 2. Review auth PR | reviewer | — | GPT-5.4 (or Gemini) | ~25K |
| 3. Refactor 2K-line service | planner → coder → reviewer | Sonnet 4.6 ×4 (parallel) | GPT-5.4 | ~146K |
| 4. Generate API docs | documenter | Sonnet 4.6 | — | ~28K |
| 5. Root-cause memory leak | investigator → coder → reviewer | Opus 4.7 (investigate), Sonnet 4.6 (fix) | GPT-5.4 | ~77K |

---

## Related

- `decisions/model-routing.md` — escalation rules, cost examples, provider selection
- `docs/models/claude.md` — Claude family detail
- `docs/models/foundry-gpt5.md` — GPT-5.4 reviewer detail
- `MODELS.md` — routing matrix and token budget defaults
- `WORKSTREAMS.md` — workstream definitions and handoff contracts

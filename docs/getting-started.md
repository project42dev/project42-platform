# Getting Started

> Date: 2026-04-28

---

## What is Project 42?

Project 42 is a framework for building software and technical documentation with coordinated AI agents. It is not a library or a platform — it is a set of files and conventions that govern how agents collaborate, how tasks are routed, and how quality is enforced.

The framework has four layers:

| Layer | What it covers | Key files |
|---|---|---|
| **Tooling** | Which coding agents, IDE extensions, and CLI tools are in scope | `TOOL_LANDSCAPE.md`, `AGENTS.md` |
| **Models** | Which models are authorized, how they are routed, and what each costs | `MODELS.md` |
| **Orchestration** | How tasks are classified, pipelined, and handed between agents | `WORKSTREAMS.md`, `.claude/agents/` |
| **Operations** | Gateways, observability, cost control, and security enforcement | `.claude/hooks/`, `.mcp.json`, `docs/operations/` |

The framework is intentionally tool-agnostic at the orchestration and operations layers. The `.claude/` runtime is Claude Code-specific, but the `AGENTS.md`, `WORKSTREAMS.md`, and `MODELS.md` files are readable by any agent that follows the Linux Foundation Agentic AI Foundation AGENTS.md standard.

---

## How to read the repo in order

If you are new, read these files in sequence. Each one builds on the last.

### 1. `AGENTS.md` — cross-tool brief

Every agent in the system reads this file. It defines what the repo is, the seven workstreams at a glance, the hard rules every agent must enforce, and the available slash commands. If you only read one file, read this one.

### 2. `WORKSTREAMS.md` — task pipelines

Defines the seven workstreams (`build`, `review`, `refactor`, `test`, `document`, `investigate`, `operate`), the agent pipeline for each, and the YAML handoff contracts agents use to pass state between them. The router agent reads this to classify incoming tasks.

### 3. `MODELS.md` — routing matrix

Defines which models are authorized, which tasks they handle, and why. The cornerstone rule — reviewer model family must differ from coder model family — lives here. Also defines default token budgets per agent.

### 4. `CLAUDE.md` — Claude Code extensions

Extends `AGENTS.md` with rules specific to Claude Code: permissions, skill loading, hook behavior, and anything that only applies when Claude Code is the driving tool. Subagents defined in `.claude/agents/` inherit these rules.

### 5. `TOOL_LANDSCAPE.md` — stack survey

A dated survey of all seven layers of the AI coding stack: coding agents, models, gateways, observability, orchestration frameworks, cross-tool config standards, and MCP servers. Use it to understand what exists and where Project 42 sits in the broader landscape. Re-verify before relying on any specific claim — this domain moves fast.

---

## How to run your first workstream

The entry point is `/route`. It classifies your task and invokes the matching workstream skill.

**Example: adding a login endpoint**

```
/route "add a login endpoint that validates JWT tokens"
```

What happens:

1. The `router` agent reads `WORKSTREAMS.md` and `MODELS.md`, classifies the task as `build`.
2. Because this touches authentication (`auth/`), the workstream automatically upgrades to `operate` (hard rule 3 in `AGENTS.md`).
3. Human approval is required before the `operator` agent proceeds.

For a non-sensitive build task:

```
/route "add a /health endpoint that returns 200 OK"
```

1. Router classifies as `build`.
2. `planner` runs if the task is non-trivial (touches > 3 files or > 1 hour estimated). Otherwise skipped.
3. `coder` implements the change.
4. `reviewer` reviews — using a different model family than the coder.
5. `documenter` updates any affected docs.
6. Human reviews the output and approves.

You can also invoke workstreams directly if you already know the classification:

```
/build "add a /health endpoint that returns 200 OK"
/review                          # runs reviewer on the current git diff
/test "add unit tests for the auth module"
/investigate "why are requests failing with 503 on the /api/submit route"
/operate "rotate the API key in production"   # requires human approval
```

---

## Where to look when stuck

| Question | Where to look |
|---|---|
| What does this repo actually do? | `AGENTS.md` → first three sections |
| Which workstream should I use? | `WORKSTREAMS.md` → workstream overview table |
| Why is the reviewer using GPT-5.4 instead of Claude? | `MODELS.md` → Rule 1 (cross-family review) |
| What is a subagent / skill / hook? | `docs/concepts/agents.md`, `docs/concepts/skills-mcp-hooks.md` |
| Why did a workstream upgrade from build to operate? | `AGENTS.md` → Hard rules, rule 3 |
| How much will this workstream cost? | `docs/concepts/tokens.md`, `docs/operations/cost-control.md` |
| What gateway or observability tool should I use? | `docs/operations/gateways.md`, `docs/operations/observability.md` |
| Which models are available and what do they cost? | `MODELS.md` → Model quick-reference |
| Why does the reviewer refuse to run? | `docs/concepts/cross-family-review.md` |
| What is a handoff contract? | `docs/concepts/workstreams.md` |
| The agent is running out of context — what do I do? | `docs/concepts/context-windows.md` |
| Where are the agent prompt files? | `.claude/agents/<name>.md` |
| Where are the skills? | `.claude/skills/<name>/` |
| Where are the hooks? | `.claude/hooks/<name>.sh` |
| What MCP servers are connected? | `.mcp.json` |

---

## Key conventions to know before you write anything

- **No silent additions.** New dependencies, files, or commands must be called out in the handoff rationale field.
- **Prompt files need a `version:` header.** CI fails without it.
- **Subagents do not inherit parent skills.** Preload skills in the agent's frontmatter.
- **Stop at 70–80% of token budget.** Summarize and hand off rather than continuing and truncating.
- **Diagrams are Mermaid source first.** SVGs are generated, never hand-edited.
- **No emojis in repo content.** See `CLAUDE.md`.


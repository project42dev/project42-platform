# Skills, MCP Servers, and Hooks

> Date: 2026-04-28

These three mechanisms extend what an agent can do and what it is allowed to do. They are often confused because they all live in `.claude/` and all affect agent behavior. They are not interchangeable.

---

## Skills — how to do something (recipe)

A skill is a procedure file that tells an agent how to perform a specific, repeatable task. Think of it as a recipe: step-by-step instructions for a specific outcome.

Skills live in `.claude/skills/<skill-name>/`. Each skill is a markdown file with a structured prompt that the agent loads when it needs to perform that task.

In Project 42, the workstream skills are:

```
.claude/skills/workstream-build/
.claude/skills/workstream-review/
.claude/skills/workstream-refactor/
.claude/skills/workstream-test/
.claude/skills/workstream-document/
.claude/skills/workstream-investigate/
.claude/skills/workstream-operate/
.claude/skills/route-decision/
.claude/skills/handoff/
```

When the `router` agent classifies a task as `build`, it loads the `workstream-build` skill. That skill defines the exact pipeline, the handoff contract format, the hard rules for that workstream, and the steps the agent should execute.

**Key property:** Skills are loaded on-demand, not always present in context. This is intentional — loading all nine workstream skills on every session would waste context budget on tasks that won't use them.

**Key constraint:** Subagents do not inherit skills from their parent. A subagent must list the skills it needs in its own frontmatter. If a `coder` subagent needs the `handoff` skill, it must declare `skills: [handoff]` in its `.claude/agents/coder.md` frontmatter.

---

## MCP Servers — access to external data and tools (API connector)

An MCP (Model Context Protocol) server gives an agent access to external resources: documentation, databases, ticket systems, observability platforms, or any external API. Think of it as an API connector.

Without an MCP server, the agent can only use the tools built into Claude Code (Read, Write, Edit, Bash, etc.). With an MCP server, the agent can call the MCP server's tools — which can pull live data, query APIs, or interact with external systems.

MCP servers are configured in `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "microsoft-learn": {
      "type": "http",
      "url": "https://learn.microsoft.com/api/mcp",
      "description": "Azure / Foundry / GPT-5.x official documentation"
    }
  }
}
```

With this configuration, any agent in the project can call the `microsoft-learn` MCP server to fetch current Azure and Foundry documentation. This is used by the `investigator` agent when researching GPT-5.x availability, by the `planner` when checking API compatibility, and by the `documenter` when linking to official references.

The MCP server does not know anything about the agent's task. It only responds to tool calls with data. The agent decides when to call it and how to use the results.

MCP is supported by Claude Code, Cursor, Cline, Kilo Code, OpenCode, OpenClaw, and most current coding tools. The `.mcp.json` file is shared across tools that read it.

---

## Hooks — enforce policy at lifecycle events (guard rail)

A hook is a script that runs at specific points in the Claude Code lifecycle: before a tool call (`PreToolUse`), after a tool call (`PostToolUse`), or when the session stops (`Stop`). Hooks enforce policy — they cannot be bypassed by agent instructions.

Think of a hook as a guard rail: it runs regardless of what the agent decides to do.

Hooks in Project 42 live in `.claude/hooks/`:

```
.claude/hooks/block-secrets.sh      # PreToolUse: blocks writes containing secret patterns
.claude/hooks/format-on-write.sh    # PostToolUse: runs formatter after any Write call
.claude/hooks/log-tokens.sh         # PostToolUse: logs token usage per tool call
.claude/hooks/summarize-session.sh  # Stop: generates session summary on exit
.claude/hooks/validate-path.sh      # PreToolUse: blocks writes outside allowed directories
```

The `block-secrets.sh` hook runs before every `Write` tool call. It scans the content for patterns that look like secrets (API keys, tokens, private keys). If it finds a match, it returns a non-zero exit code, which causes Claude Code to block the write. The agent is told the write was blocked and why.

The agent cannot override this. A skill cannot instruct the agent to bypass a hook. This is the point — hooks exist precisely for policies that must hold regardless of what the agent decides.

---

## When to use which

| You want to... | Use |
|---|---|
| Teach the agent a repeatable procedure | Skill |
| Give the agent access to live external data | MCP server |
| Prevent the agent from doing something regardless of its reasoning | Hook |
| Give the agent a new built-in capability (file ops, shell commands) | Claude Code tools (not configurable) |
| Pull in reference docs the agent can read on demand | MCP server or a local file the agent reads |
| Enforce a format or style after every write | Hook (PostToolUse on Write) |
| Route tasks to the right pipeline | Skill (route-decision + workstream-*) |
| Block writes to sensitive paths | Hook (PreToolUse on Write) |

Decision table:

| Mechanism | Loaded by | Can be bypassed by agent? | Lives in |
|---|---|---|---|
| Skill | Agent on-demand (or via frontmatter) | Yes — it's instructions | `.claude/skills/` |
| MCP server | Claude Code runtime (always available if configured) | Agent chooses when to call it | `.mcp.json` |
| Hook | Claude Code runtime (always runs at lifecycle events) | No | `.claude/hooks/` |

---

## How they interact

Skills, MCP servers, and hooks can interact within a single agent turn:

**Example — build workstream, Write tool call:**

1. `coder` loads the `workstream-build` skill (instructions for the build pipeline).
2. The skill instructs the coder to write new source files.
3. Before the `Write` tool call executes, `block-secrets.sh` and `validate-path.sh` hooks run (PreToolUse).
4. If either hook fails, the write is blocked. The agent receives the error and must adjust.
5. If hooks pass, the `Write` executes.
6. After the write, `format-on-write.sh` runs (PostToolUse) and reformats the file.
7. `log-tokens.sh` runs (PostToolUse) and records the token cost.

**Example — investigator querying Foundry docs:**

1. `investigator` loads the `workstream-investigate` skill.
2. The skill instructs the investigator to research GPT-5.4 regional availability.
3. The agent calls the `microsoft-learn` MCP server to fetch current Foundry documentation.
4. The MCP result comes back as a tool call result, added to context.
5. The `log-tokens.sh` hook records the token cost of the MCP call's result.
6. The investigator incorporates the data into its findings document.

A skill might instruct an agent to use an MCP tool. A hook might block an action the skill told the agent to take. The enforcement hierarchy is: hooks > agent reasoning > skills. Hooks always win.


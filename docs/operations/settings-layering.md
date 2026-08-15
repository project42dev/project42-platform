# Settings Layering

**Last updated:** 2026-04-30

Claude Code loads settings from three tiers in order. Later tiers override earlier ones. This makes it possible to define global defaults, team-committed overrides, and machine-local exceptions without touching the same file in multiple places.

---

## The three tiers

| Tier | Path | Committed? | Scope |
|---|---|---|---|
| User | `~/.claude/settings.json` | No (personal) | Every project on this machine |
| Project | `<repo>/.claude/settings.json` | Yes (team-shared) | Everyone who clones this repo |
| Local override | `<repo>/.claude/settings.local.json` | No (gitignored) | This machine only, this repo |

**User settings** are the right place for: machine-wide tool permissions, env vars needed in every project (e.g., `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), and global deny rules.

**Project settings** are the right place for: repo-specific `allow` arrays for CI-safe commands, hook registrations that the whole team should use, and env vars that belong to the project (not the user).

**Local overrides** are the right place for: permissions you need locally that shouldn't be committed (e.g., destructive bash commands you're trialing), machine-specific env vars, or temporarily relaxing a project-level restriction.

---

## Permission `allow` arrays

The `allow` array in any settings tier lists tool call patterns that Claude Code may execute without prompting the user. Patterns use glob syntax: `Bash(npm run *)` allows any `npm run` subcommand.

Example from a committed project settings file:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git add *)",
      "Bash(git commit *)"
    ]
  }
}
```

Hook scripts that need to be executable can be allowed via:

```json
"Bash(chmod +x .claude/hooks/*.sh)"
```

For the fastest path to reducing permission prompts in your own session, run `/fewer-permission-prompts` — the skill scans recent tool calls and generates a targeted allowlist.

---

## Hook registration

Hooks are lifecycle callbacks — shell scripts that run at specific events. They are registered in `.claude/settings.json` under the `hooks` key.

For the full authoring guide see [`learning-path/04-power-user/03-hooks.md`](../../learning-path/04-power-user/03-hooks.md). This section only covers the settings-level registration.

Example hook registration:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/format-on-write.sh" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/summarize-session.sh" }]
      }
    ]
  }
}
```

---

## The agent teams flag

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enables multi-agent parallelism — the ability to spawn subagents that run concurrently. Without it, agent invocations are sequential.

**Add at the user level** if you want it in every project:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**Add at the project level** if only specific repos should have it enabled:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

The flag is experimental. If a project's agents are not designed for parallelism (shared mutable state, conflicting file edits), it is safest to enable it at the project level only rather than globally at the user level.

---

## A worked layering example

Scenario: you want a hook that logs every edit. You want it everywhere, but a specific repo must suppress it locally because it generates too much noise in a high-volume scaffold repo.

**User-level** (`~/.claude/settings.json`) — registers the hook globally:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/log-edits.sh" }]
      }
    ]
  }
}
```

**Project-level** (`<repo>/.claude/settings.json`) — does not re-register the hook. The user-level registration applies.

**Local override** (`<repo>/.claude/settings.local.json`) — overrides the hook array to suppress the hook on this machine for this repo:

```json
{
  "hooks": {
    "PostToolUse": []
  }
}
```

Local overrides win over project and user settings for the same key.

---

## Related

- [`learning-path/04-power-user/03-hooks.md`](../../learning-path/04-power-user/03-hooks.md) — full hook authoring guide
- [`docs/concepts/subagent-roster-design.md`](../concepts/subagent-roster-design.md) — where to place agents across the three tiers
- [`guides/custom-slash-commands.md`](../../guides/custom-slash-commands.md) — slash command scope follows the same user vs. project rules

# GitHub Copilot

> Microsoft and GitHub's AI coding assistant, embedded across VS Code, Visual Studio, JetBrains, and the GitHub web UI.

**Category:** coding agent in VS Code
**Cost model:** Individual $10/mo; Business $19/user/mo; Enterprise $39/user/mo (verify current pricing)
**Last verified:** 2026-04-28

---

## What it is

GitHub Copilot is Microsoft and GitHub's AI coding product, available as an IDE extension and integrated into GitHub.com. It provides inline ghost-text autocomplete, a chat panel (Copilot Chat), and an agent mode that can make multi-file edits. As of late 2024 and into 2025, Copilot began supporting Claude models alongside its existing OpenAI and Microsoft model lineup. It works in VS Code, Visual Studio, JetBrains, Neovim, and the GitHub web editor.

## Where it shines

- Teams already on GitHub Enterprise who want AI coding integrated into their existing GitHub workflow (PR reviews, issue triage, web editor)
- Multi-IDE environments where a single subscription covers VS Code, Visual Studio, and JetBrains
- Inline autocomplete that is among the most mature and widely tested in the market
- Organizations that need SSO, policy controls, and an enterprise procurement path

## Where it falls down

- Agent mode is less capable than Claude Code or Cursor's Composer for complex multi-step autonomous tasks
- Model choice on lower tiers is limited; you don't always know which model is generating a given response
- Enterprise plan is required for some compliance and data-handling guarantees
- Heavily integrated into GitHub; teams on GitLab or self-hosted git get less value from the GitHub-specific features

## When to reach for it

When your team is already on GitHub and wants one AI subscription that covers multiple IDEs, PR reviews, and web-based coding — especially for inline autocomplete as the primary use case.

## When NOT to reach for it

When you need deep autonomous agentic capability (long multi-step tasks, test-fix loops, complex refactors). Copilot's agent mode is improving but Claude Code or Cursor are stronger for that pattern.

## Cost notes

Individual plan ($10/mo) covers one user across all supported IDEs. Business ($19/user/mo) adds org management and policy. Enterprise ($39/user/mo) adds IP indemnity, data handling guarantees, and fine-tuned model options. Costs are per seat, not per token, which makes budgeting predictable for large teams.

## Setup pointer

Install the "GitHub Copilot" extension from the VS Code Marketplace (or the JetBrains Marketplace). Sign in with your GitHub account. A Copilot subscription must be active on that account or organization.

## Links

- Official site: https://github.com/features/copilot
- Docs: https://docs.github.com/en/copilot

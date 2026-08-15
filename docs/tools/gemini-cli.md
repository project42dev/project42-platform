# Gemini CLI

> Google's open-source terminal coding agent, backed by Gemini models, with a generous free tier.

**Category:** coding agent in CLI
**Cost model:** free tier (Gemini API free quota); paid tier via Google AI Studio or Vertex AI API (verify current limits)
**Last verified:** 2026-04-28

---

## What it is

Gemini CLI is Google's open-source terminal agent, roughly analogous to Claude Code in its interaction model: you run it in a project directory, describe tasks in natural language, and it reads files, writes edits, and runs shell commands. It uses the Gemini model family (Gemini 2.5 Pro and Flash as of early 2026) and comes with a free tier through the Gemini API, making it the lowest-barrier entry point for terminal AI coding agents. It was released publicly in mid-2025.

## Where it shines

- Developers who want to try a capable terminal agent at zero cost before committing to a paid product
- Google Cloud / Vertex AI shops that want native Google model integration without another vendor
- Tasks that benefit from Gemini's very large context window (up to 1M tokens), such as analyzing entire large codebases in one pass
- Teams already using Google Workspace or Firebase who want a consistent Google AI stack

## Where it falls down

- Newer than Claude Code and Aider; community patterns, guides, and integrations are less mature
- Free tier rate limits can interrupt longer agentic sessions; paid tiers require Google Cloud billing setup
- Ecosystem tooling (MCP servers, hooks, subagent patterns) is less developed than Claude Code's
- Some users find Gemini model behavior less predictable on complex multi-step coding tasks compared to Claude

## When to reach for it

When you want a zero-cost starting point for a terminal coding agent, or when you are in the Google Cloud ecosystem and want native Gemini model access.

## When NOT to reach for it

When you need a mature, battle-tested agent with a rich ecosystem of extensions and community patterns. Claude Code is a better choice for production team use.

## Cost notes

The free tier via Google AI Studio offers a quota of requests per minute and per day (verify current limits at https://ai.google.dev/pricing). Beyond the free quota, you need a Google AI Studio paid plan or Vertex AI billing. Vertex AI charges per token at standard Gemini rates.

## Setup pointer

Install via npm: `npm install -g @google/gemini-cli`. Run `gemini` in your project directory. Authenticate with `gemini auth` using your Google account. A Google AI Studio API key works for the free tier.

## Links

- Official site: https://gemini.google.com/cli (verify URL)
- GitHub: https://github.com/google-gemini/gemini-cli
- Pricing: https://ai.google.dev/pricing

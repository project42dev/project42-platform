# Continue

> Open-source VS Code and JetBrains extension for AI-assisted coding, with BYOM and deep IDE integration.

**Category:** coding agent in VS Code
**Cost model:** free extension; you pay your own model provider per token (BYOM)
**Last verified:** 2026-04-28

---

## What it is

Continue is an open-source AI coding assistant that works inside both VS Code and JetBrains IDEs. It provides inline autocomplete, a chat panel, slash commands for common coding tasks, and a context system that lets you reference files, docs, web pages, and terminal output in your prompts. It supports a wide range of model providers (Anthropic, OpenAI, Azure, Bedrock, Ollama, LM Studio, and more) through a JSON configuration file.

## Where it shines

- JetBrains users who want a Cline-comparable experience — Continue is one of the few tools with real JetBrains support
- Teams that want a single extension across VS Code and JetBrains with consistent configuration
- Developers who need fine-grained context control (reference specific docs, terminal output, or URLs inline)
- Local-model setups where Ollama or LM Studio handles inference and you want zero cloud cost

## Where it falls down

- Agentic file-writing capabilities are less mature than Cline or Claude Code; it's stronger as a chat + autocomplete tool
- The JSON configuration file can be verbose to set up for teams with multiple providers and models
- Community-maintained; feature cadence depends on contributor availability
- Long agentic task orchestration is not its primary design target

## When to reach for it

When you work in JetBrains or need a uniform AI assistant across both VS Code and JetBrains, especially for chat, autocomplete, and context-rich Q&A rather than full agentic file editing.

## When NOT to reach for it

When you need a full agentic loop that writes files, runs commands, and iterates autonomously. Cline or Claude Code handle that better.

## Cost notes

No subscription fee. Token cost depends on the model and provider you configure. Autocomplete requests against a local Ollama model cost nothing beyond electricity. Heavier chat sessions against Claude Sonnet or GPT-4o accumulate token costs at normal API rates.

## Setup pointer

Install "Continue" from the VS Code Marketplace or JetBrains Marketplace. On first launch, the extension opens a configuration wizard. For manual configuration, edit `~/.continue/config.json` to add providers and models.

## Links

- Official site: https://continue.dev
- Docs: https://docs.continue.dev
- GitHub: https://github.com/continuedev/continue

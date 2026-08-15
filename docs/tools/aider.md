# Aider

> CLI pair programmer that is git-aware by default, committing every change it makes.

**Category:** coding agent in CLI
**Cost model:** free tool; you pay your own model provider per token (BYOM)
**Last verified:** 2026-04-28

---

## What it is

Aider is an open-source Python CLI tool that works directly with your git repository. You describe a change in natural language, and Aider edits the relevant files, then automatically commits the result with a descriptive message. It uses a structured diff format ("edit blocks") that keeps model output compact and precise. It supports the Anthropic API, OpenAI API, Azure OpenAI, Ollama, and most OpenAI-compatible endpoints.

## Where it shines

- Rapid iteration on well-scoped, single-task changes where you want an immediate git commit
- Repos where a clean commit history matters — every Aider change is a discrete, reviewable commit
- Terminal-only environments (SSH, containers, CI) where a GUI IDE is unavailable
- Developers who prefer a fast edit-commit loop over a longer agentic session

## Where it falls down

- Less suited to long multi-step agentic tasks; it's optimized for discrete changes, not orchestrated workflows
- Context management is manual — you specify which files to add; it won't crawl the repo automatically unless you use `/add` broadly
- No integrated test runner loop by default (though you can script around it)
- No VS Code or JetBrains GUI; pure terminal

## When to reach for it

When you have a clear, bounded task ("add input validation to this function", "write tests for this module") and you want the result committed immediately without ceremony.

## When NOT to reach for it

When the task requires exploring an unfamiliar codebase, running tests iteratively, or coordinating changes across many files that Aider hasn't been explicitly told about.

## Cost notes

Aider itself is free. Token cost depends on model and files added to context. Claude Sonnet and GPT-4o are the recommended backends. Adding large files unnecessarily is the primary cost driver — Aider's `/tokens` command shows current context size before you commit to a request.

## Setup pointer

Install via pip: `pip install aider-install && aider-install`. Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, then run `aider` in your git repo. Use `--model` to specify the model.

## Links

- Official site: https://aider.chat
- Docs: https://aider.chat/docs
- GitHub: https://github.com/paul-gauthier/aider

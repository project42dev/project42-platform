# Decisions

**Last verified:** 2026-09-10

Why Project 42 is built the way it is. Planning material and the original internal decision records are private by deliberate decision, so the pages here are authored rather than copied — see [the note in the docs index](../README.md).

---

## Architecture

| Decision | What it settles |
|---|---|
| [The Front End Lives in the Platform](front-end-in-the-platform.md) | Why the rendering application is product rather than one deployment's code, why it is installed onto a front-end repository rather than imported, and why a deployment's `app/` is a build output |
| [Three-Layer Theming](three-layer-theming.md) | Who owns appearance — core, the bundle the product carries, and the Gallery's alternatives — and why the model was reversed once and reinstated |
| [The Orchard Boundary](orchard-boundary.md) | Why the content-maintenance system is private and not part of the open-source product, why its method is public and its implementation is not, and where its responsibility ends |
| [The Canonical Content Split](canonical-content.md) | Why curriculum is a separate repository, and why the platform consumes it hash-locked |

These four were backfilled on 2026-09-10 from the commit record and the code. Each ends with a section that separates three things: what the public record establishes, what is recorded in the private planning material and so cannot be reproduced here, and what is genuinely not written down anywhere that was searched. Where a rationale could not be established, the record says so rather than supplying a plausible one.

## Tooling and models

| Decision | What it settles |
|---|---|
| [Model Routing — Worked Examples](model-routing.md) | Which model handles which stage of a task, with token budgets |
| [Tool Selection Decision Table](tool-selection.md) | Which coding agent to reach for, and the cost trade-offs |

These two are curriculum-facing reference pages, moved here from a preserved transitional archive on 2026-08-15. They predate the four above and use a table-first shape rather than a decision record's.

## Related

- [../architecture.md](../architecture.md) — the three-layer architecture and its principles
- [../appearance-contract.md](../appearance-contract.md) — the division of ownership the theming decision implements
- [../how-content-stays-current.md](../how-content-stays-current.md) — the public account of content maintenance
- [../README.md](../README.md) — the documentation index

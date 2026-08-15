# Orchard

Orchard is the content lifecycle engine for Project 42. It is a separate
open-source tool with its own repository, and it is a core part of Project 42
rather than an optional add-on, which is why what it is and what it does are
documented here with everything else.

**Deployment and implementation documentation stays with the code**, in
[github.com/project42dev/orchard](https://github.com/project42dev/orchard).
That split is deliberate: how a thing works belongs next to the reader who is
running it, and what a thing is belongs next to the rest of Project 42.

## What Orchard is

It watches an approved list of primary sources for what the world teaches that
this estate does not, inspects the published corpus for what has stopped being
true, and proposes work. **It never publishes anything a person has not
approved twice.**

## Read in this order

| Document | What it answers |
|---|---|
| [status.md](status.md) | What is built, deployed and actually proven, in separate columns |
| [lifecycle.md](lifecycle.md) | One content item from first noticed to retired |
| [workflow-orchestration.md](workflow-orchestration.md) | The two evidence tracks and what each may write |
| [decisions.md](decisions.md) | The reasoning by theme, with the failure behind each decision |
| [adr/](adr/index.md) | Thirteen accepted decisions, one page each |

Start with [status.md](status.md). An architecture decision records a decision
and is not evidence that anything is built, and this project has been bitten by
reading the two as the same thing.

## Running it

- [Install guide](https://github.com/project42dev/orchard/blob/main/docs/install.md)
- [Hosting architecture](https://github.com/project42dev/orchard/blob/main/docs/hosting-architecture.mmd)
- [Repository boundary](https://github.com/project42dev/orchard/blob/main/REPO-BOUNDARY.md)

Orchard consumes an OpenAI-compatible endpoint and never provisions one, so it
is not tied to any cloud. The container image is the portable artifact.

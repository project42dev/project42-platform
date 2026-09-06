# Repository boundary

This file states what this repository is for, what must never be added to it,
and where to look instead. It exists because two codebases ended up in the
wrong repositories, and both got there through a directory convention that
nobody enforced.

The content-maintenance tooling is a separate repository, and the model layer
is a read-only dependency of it. See
[how the curriculum stays current](docs/how-content-stays-current.md).

## What this is

**The open source platform: the content itself, the content model, the schemas, and the packages the delivery surfaces consume.**

- Visibility: **public**

## What must never go here

| Do not add | Because | Where it belongs |
|---|---|---|
| **Private planning, PMO material, or board records** | This repository is public. | `project42dev-ops`, which is private |
| **Infrastructure definitions** | The platform is consumed as a package; it does not provision anything. | `homestead-foundry`, or the adopter's own infrastructure repo |
| **The tooling that builds content** | A content library that ships its own authoring tool cannot be adopted by anyone with different tooling. | The upstream maintenance system's own repository |
| **Secrets, tenant names, subscription ids, keys, vault names** | Public repository. | The operator's own secret store |

## A note on the content files

The content files here are the **source of truth**. Anything the upstream
maintenance system derives from them is derived: it can be deleted and rebuilt
from a checkout at any time, and it does not live here.

Every content item must carry `lastVerified` and `reviewCadenceDays`. An item
without them cannot be stale, so it drops silently out of every staleness
count and the totals look healthy. That was true of all 66 Learn modules until
2026-08-03.

## Looking for something else?

| Looking for | It lives in |
|---|---|
| The content maintenance tool: discovery, authoring, currency | Its own repository, operated by the owner and not part of the open-source product. Its method is described in [how the curriculum stays current](docs/how-content-stays-current.md) |
| The public marketing and entry surface | `project-42.dev` |
| The Learn delivery surface | `project-42.dev`, under `/learn/**` |
| The Field Guide delivery surface | `project-42.dev`, under `/guide/**` |
| Learner account and profile | `project-42.dev`, under the account routes |
| Owner administration | `admin.project-42.dev` |
| Planning, sprints, ADRs, board records | `project42dev-ops`, private |
| An Azure AI Foundry deployment framework | `homestead-foundry` |
| One owner's Foundry instance and model registry | `my-homestead-foundry` |

## The rule in one line

**This repository holds what is taught. It never holds what teaches it, what hosts it, or what plans it.**

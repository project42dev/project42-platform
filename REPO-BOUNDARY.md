# Repository boundary

This file states what this repository is for, what must never be added to it,
and where to look instead. It exists because two codebases ended up in the
wrong repositories, and both got there through a directory convention that
nobody enforced.

Governing decision: **ADR-0017**, Orchard and the Foundry layer separation.

## What this is

**The open source platform: the content itself, the content model, the schemas, and the packages the delivery surfaces consume.**

- Visibility: **public**

## What must never go here

| Do not add | Because | Where it belongs |
|---|---|---|
| **Private planning, PMO material, or board records** | This repository is public. | `project42dev-ops`, which is private |
| **Infrastructure definitions** | The platform is consumed as a package; it does not provision anything. | `homestead-foundry`, or the adopter's own infrastructure repo |
| **The tooling that builds content** | A content library that ships its own authoring tool cannot be adopted by anyone with different tooling. | `orchard` |
| **Secrets, tenant names, subscription ids, keys, vault names** | Public repository. | The operator's own secret store |

## A note on the content files

The content files here are the **source of truth**. Orchard compiles them into
a queryable database, and that database is derived: it can be deleted and
rebuilt from a checkout at any time. Two tables inside it are not derived and
do not live here, `work_item` and `rendering`. See ADR-0019.

Every content item must carry `lastVerified` and `reviewCadenceDays`. An item
without them cannot be stale, so it drops silently out of every staleness
count and the totals look healthy. That was true of all 66 Learn modules until
2026-08-03.

## Looking for something else?

| Looking for | It lives in |
|---|---|
| The content lifecycle tool: discovery, authoring, currency | `orchard` |
| The public marketing and entry surface | `project-42.dev` |
| The Learn delivery surface | `learn.project-42.dev` |
| The Field Guide delivery surface | `guide.project-42.dev` |
| Learner account and profile | `account.project-42.dev` |
| Owner administration | `admin.project-42.dev` |
| Planning, sprints, ADRs, board records | `project42dev-ops`, private |
| An Azure AI Foundry deployment framework | `homestead-foundry` |
| One owner's Foundry instance and model registry | `my-homestead-foundry` |

## The rule in one line

**This repository holds what is taught. It never holds what teaches it, what hosts it, or what plans it.**

# Project 42 documentation

**This is the one location for public Project 42 documentation.** It lives in
`project42-platform` because that is the main open-source repository, and
because the platform is already where content and contracts are canonical
rather than copied between sites.

It is a location, not a website. Nothing here is published yet, and publishing
is a separate decision.

## Start here

| If you want to | Read |
|---|---|
| Understand the ideas | [concepts/](concepts/) |
| Run Project 42 yourself | [self-hosting/](self-hosting/) · [Theming & Portal Guide](self-hosting/portal-and-theming.md) |
| Choose and wire up models | [models/](models/) |
| Connect a tool or an editor | [tools/](tools/) |
| Operate a deployment | [operations/](operations/) |
| Know why something is built the way it is | [decisions/](decisions/) |
| Understand Orchard, the content lifecycle engine | [orchard/](orchard/README.md) |
| Build against the contracts | the contract pages below |
| Get going quickly | [getting-started.md](getting-started.md) |

## Contracts

These define the interfaces other code depends on. Treat a change to any of
them as a breaking change until proven otherwise.

- [learning-event-contract.md](learning-event-contract.md)
- [content-maintenance-contracts.md](content-maintenance-contracts.md)
- [self-hosted-model-learning-contract.md](self-hosted-model-learning-contract.md)
- [training-package-format.md](training-package-format.md)
- [resource-pack-validation.md](resource-pack-validation.md)
- [hosted-learning-record-adapter.md](hosted-learning-record-adapter.md)
- [authorization-boundaries.md](authorization-boundaries.md)

## Learner data, records and credentials

- [learner-data-policy.md](learner-data-policy.md)
- [authoritative-transcripts.md](authoritative-transcripts.md)
- [learning-record-receipts.md](learning-record-receipts.md)
- [learning-record-recovery.md](learning-record-recovery.md)
- [badge-credentials.md](badge-credentials.md)
- [browser-sessions.md](browser-sessions.md)
- [account-notifications.md](account-notifications.md)
- [owner-administration-pagination.md](owner-administration-pagination.md)

## Content

- [content-authoring.md](content-authoring.md)
- [content-freshness-pipeline.md](content-freshness-pipeline.md)
- [agentic-ai-evidence-method.md](agentic-ai-evidence-method.md)
- [contributor-credit.md](contributor-credit.md)
- [virtual-instructor-production.md](virtual-instructor-production.md)
- [training/](training/)

## Orchard

Orchard is the content lifecycle engine, a separate open-source tool and a core
part of Project 42. **What it is and what it does are documented here**, in
[orchard/](orchard/README.md): status, lifecycle, workflow orchestration,
decisions, and thirteen decision records.

**How to deploy and run it stays with the code**, in
[github.com/project42dev/orchard](https://github.com/project42dev/orchard).
That is the line throughout this repository: what a thing is lives here, how to
operate it lives beside the code the operator is running.

## What is deliberately not here

**Planning, PMO material and the original architecture decision records are
private** by deliberate decision, so that candid early analysis has somewhere
candid to happen. Public versions are authored rather than copied, which is why
`decisions/` is thinner than the private record and is expected to grow.

## Where this came from

The `concepts`, `tools`, `models`, `operations` and `decisions` sets were moved
here from `project42dev.github.io` on 2026-08-15. That repository is a
preserved transitional archive and explicitly not a canonical content source,
so documentation was living in the one place designated not to hold it.

# Project 42 Platform

The open-source learning core and content model powering
[Project 42](https://project-42.dev).

Project 42 is designed for people learning AI for the first time and practitioners
who need trustworthy, current references. This repository contains the reusable
contracts—not the private PMO records or Project42dev production configuration.

## Included

- A typed, validated catalog for resources, learning paths, modules, and checks.
- Provider-neutral curriculum with Anthropic, OpenAI, and selected-provider branches.
- Pure assessment scoring and learner-progress functions.
- Portable JSON learner-record export, CSV transcripts, and badge derivation.
- Seed content suitable for a hosted site or self-hosted installation.

## Quick start

```bash
npm ci
npm test
```

```ts
import {
  starterCatalog,
  createEmptyProgress,
  buildPortableLearnerRecord,
  scoreKnowledgeCheck,
} from "@project42/platform";
```

## Repository boundaries

- Public hosted application: `project42dev/project-42.dev`
- Private operations and planning: `project42dev/project42dev-ops`
- Transitional MVP: `project42dev/project42dev.github.io`

## Licensing

Software is licensed under Apache-2.0. Educational material under `content/` is
licensed under CC BY 4.0 unless a file says otherwise. See
[`LICENSE-CONTENT.md`](LICENSE-CONTENT.md).

## Status

`0.x` is an early contract. Schema changes may occur before 1.0 and will be
recorded in release notes.

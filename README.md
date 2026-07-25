# Project 42 Platform

The open-source learning core and content model powering
[Project 42](https://project-42.dev).

Project 42 is designed for people learning AI for the first time and practitioners
who need trustworthy, current references. This repository contains the reusable
contracts—not the private PMO records or Project42dev production configuration.

## Included

- A typed, validated catalog for resources, learning paths, modules, and checks.
- Modular curriculum files with hands-on activities and instructor-ready narration,
  scene, checkpoint, and assessment scripts.
- A primary-source registry and freshness gate for volatile content.
- Provider-neutral curriculum with Anthropic, OpenAI, and selected-provider branches.
- Pure assessment scoring and learner-progress functions.
- Portable JSON learner-record backup/restore, CSV transcripts, and badge derivation.
- Seed content suitable for a hosted site or self-hosted installation.

Release `0.7.0` expands AI Foundations to seven sequenced modules. Four substantive
fundamentals modules add 16 lesson sections, four evidence-producing activities,
20 reviewed questions, and machine-readable instructor scripts backed by current
primary-source references.

See [Content authoring](docs/content-authoring.md) to add paths, modules, checks,
and field-guide resources without changing application code.

## Quick start

```bash
npm ci
npm run check
```

```ts
import {
  starterCatalog,
  createEmptyProgress,
  buildPortableLearnerRecord,
  restorePortableLearnerRecord,
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

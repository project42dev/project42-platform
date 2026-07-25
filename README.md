# Project 42 Platform

The open-source learning core and content model powering
[Project 42](https://project-42.dev).

Project 42 is designed for people learning AI for the first time and practitioners
who need trustworthy, current references. This repository contains the reusable
contracts—not the private PMO records or Project42dev production configuration.

## Included

- A typed, validated catalog for resources, learning paths, modules, and checks.
- Modular curriculum files with hands-on activities and instructor-ready narration,
  scene, checkpoint, assessment, caption, transcript, and reduced-motion packages.
- A primary-source registry and freshness gate for volatile content.
- Provider-neutral curriculum with Anthropic, OpenAI, and selected-provider branches.
- Pure assessment scoring and learner-progress functions.
- Portable JSON learner-record backup/restore, CSV transcripts, capstone evidence,
  and badge derivation.
- Seed content suitable for a hosted site or self-hosted installation.

Release `0.10.0` begins the complete Reliable Agent Workflows path with four
substantive modules covering bounded agent loops, typed tool contracts, context
engineering, and governed memory. Each module includes an evidence-producing
exercise, five scenario-based questions, current primary sources, and a validated
instructor package. Instructor schema 1.1 binds narration cues to captions and a
complete transcript while preserving reduced-motion alternatives.

The prior `0.9.0` release established the sixteen-module AI Foundations path,
including evidence-based research, writing and transformation, coding and analysis,
safe tool use, and a scored practical capstone.

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
- Transitional site: `project42dev/project42dev.github.io`

## Licensing

Software is licensed under Apache-2.0. Educational material under `content/` is
licensed under CC BY 4.0 unless a file says otherwise. See
[`LICENSE-CONTENT.md`](LICENSE-CONTENT.md).

## Status

`0.x` is an early contract. Schema changes may occur before 1.0 and will be
recorded in release notes.

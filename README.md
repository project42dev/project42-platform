# Project 42 Platform

The open-source learning core and content model powering
[Project 42](https://project-42.dev).

Project 42 is designed for people learning AI for the first time and practitioners
who need trustworthy, current references. This repository contains the reusable
contracts—not the private PMO records or Project42dev production configuration.

## Included

- A typed, validated catalog for resources, learning paths, modules, and checks.
- Rich resource discovery metadata with derived freshness, editorial ownership,
  stable slugs, typed audiences, formats, prerequisites, and review policy.
- Modular curriculum files with hands-on activities and instructor-ready narration,
  scene, checkpoint, assessment, caption, transcript, and reduced-motion packages.
- A primary-source registry and freshness gate for volatile content.
- Provider-neutral curriculum with Anthropic, OpenAI, and selected-provider branches.
- Pure assessment scoring and learner-progress functions.
- Portable JSON learner-record backup/restore, CSV transcripts, capstone evidence,
  and badge derivation.
- Seed content suitable for a hosted site or self-hosted installation.

Release `0.26.0` adds six source-backed prompting and context field guides:
task framing, prompt-pattern selection, context selection, context refresh,
structured-output contracts, and a five-template daily-use pack. Each guide
includes safe placeholders, an expected result, verification steps, audience and
provider metadata, editorial ownership, review cadence, and current primary
sources. New resources are modular JSON documents discovered during the build.

Release `0.13.0` completes the twelve-module Reliable Agent Workflows path with
an evidence-mapped practical capstone. Learners produce an architecture and state
model, permission matrix, threat model, evaluation set, failure tests, observability
plan, operating runbook, and operational handoff. A complete and a deliberately
flawed exemplar calibrate the 100-point rubric across correctness, safety, evidence,
reliability, maintainability, and communication. Passing requires both the knowledge
check and a rubric score of at least 80 percent; failed submissions remain available
for revision.

Release `0.12.0` added offline agent evaluation, privacy-preserving
observability, failure classification, incident containment, reconciliation,
rollback, recovery, and continuous improvement. Its exercises produce an
evaluation set and rubric, trace-review artifact, telemetry policy, and operational
runbook. Provider-specific Anthropic, OpenAI, and Google examples remain adapters
around portable concepts rather than false feature equivalents.

Release `0.11.0` added MCP architecture and lifecycle, trust and security,
orchestration pattern selection, and auditable multi-agent handoffs.

Every substantive module includes an evidence-producing exercise, five
scenario-based questions, current primary sources, and a validated instructor
package. Instructor schema 1.1 binds narration cues to captions and a complete
transcript while preserving reduced-motion alternatives.

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
  getResourceFreshness,
  restorePortableLearnerRecord,
  scoreKnowledgeCheck,
} from "@project42/platform";

const freshness = getResourceFreshness(
  starterCatalog.resources[0],
  "2026-07-25",
);
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

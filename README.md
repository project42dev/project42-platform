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
- Provider-neutral class-script and immutable virtual-instructor media contracts with
  multi-model provenance, independent verification, accessibility, and human release
  gates ([production guide](docs/virtual-instructor-production.md)).
- A primary-source registry and freshness gate for volatile content.
- Provider-neutral curriculum with Anthropic, OpenAI, and selected-provider branches.
- Pure assessment scoring and learner-progress functions.
- Portable JSON learner-record backup/restore, CSV transcripts, capstone evidence,
  and badge derivation.
- A versioned learner-data lifecycle policy covering consent, retention, recovery,
  export, deletion, role boundaries, and hosted/self-host adapter requirements.
- A provider-neutral OIDC Worker API with approval states, exact-domain rules,
  owner administration endpoints, D1 migrations, progress synchronization, and
  append-only authorization audits.
- Versioned, machine-readable content-maintenance evidence, impact, Foundry role,
  multi-model execution, deterministic gate, rollback, and human approval contracts.
- Seed content suitable for a hosted site or self-hosted installation.

Release `0.48.0` establishes the class-ready virtual-instructor boundary. It
distinguishes complete read-aloud teaching scripts from short production cues,
requires sourced section coverage, demonstrations, feedback, reconciled timing and
word counts, independent writer/verifier model families, accessibility alternatives,
media provenance, and human approval. The published representative package includes
a substantial class script plus deterministic WebVTT captions, transcript, text-only,
reduced-motion, and integrity artifacts; its voice/avatar manifest remains a draft
until real qualification and approval occur.

Release `0.47.0` turns the governed content-freshness architecture into reusable
contracts. It maps a changed primary source to Learn, Field Guide, assessment, and
instructor-package consumers; qualifies Foundry role profiles against an inventory;
requires three model deployments and writer/verifier provider independence; and
fails publication closed until deterministic gates and a human approval pass.

Release `0.46.4` appends request-correlated denial evidence for identifiable
non-owner administration attempts and adds a deployment gate that keeps
exact-domain automatic approval locked until real verified-email token semantics
are accepted.

Release `0.46.3` adds a real D1-backed account-service lifecycle gate and
normalizes administrative audit events to the public camel-case API contract.
The gate covers owner bootstrap, approvals, verified-domain policy, progress,
assessment evidence, transcripts, badges, export, suspension, recovery,
deletion, revocation, and audit correlation.

Release `0.46.0` completes the account lifecycle with a reversible rejected state
and adds recent-authentication-protected learner-data export, consent history,
seven-day account deletion, owner completion controls, and pseudonymous deletion
tombstones.

Release `0.45.0` restores four practical workflow recipes for stack-trace
debugging, bounded critic loops, documentation backfill, and legacy refactoring.

Release `0.44.0` restores four AI service operations guides for authentication
and billing readiness, cost control, gateway decisions, and observability
platform selection.

Release `0.43.0` adds five model and provider decision guides covering current
family discovery, hosting shape, role routing, Microsoft Foundry, and open-weight
adoption.

Release `0.42.0` adds five setup and quick-reference Field Guides for workspace
bootstrap, Windows Terminal, configuration layering, commands and hooks, and a
daily operating loop.

Release `0.41.0` restores the complete fifteen-tool coding-assistant catalog
identified in the legacy Field Guide inventory. Each source-verified operating
card documents task fit, permissions, repository instructions, expected
evidence, independent verification, and bounded recovery without assuming one
model provider or silently enabling consequential actions.

Release `0.40.0` adds the provider-neutral account and learning-record API,
replayable Cloudflare D1 migrations, exact verified-domain approval policy,
owner administration contracts, immutable authorization audit records, and
local-to-account progress migration support. It also restores current,
source-backed operating cards for Claude Code, Codex CLI, and Gemini CLI while
keeping deployment-specific identity and infrastructure values outside the
public repository.

Release `0.38.0` adds the reusable learner-data lifecycle contract. It defines
issuer-and-subject identity, six account states, allowed transitions, minimal
profile fields, versioned consent, retention classes, recent-authentication export,
verified deletion and backup replay, recovery objectives, tenant-scoped roles, and
the Sites D1 hosted/PostgreSQL reference storage profiles. Validation rejects
email-keyed identity, cross-tenant defaults, unsafe exports, and incomplete deletion.

Release `0.37.0` adds the consolidated acceptance gate for all ten evaluation,
safety, troubleshooting, and operations playbooks. Exact membership spans both
resource roots and requires provider-neutral scope, current primary sources,
verification and recovery guidance, safe reusable artifacts, and explicit
owner/cadence and stop-criteria fields in every operational record, plus a
separate expected-evidence verification section.

Release `0.36.0` adds five provider-neutral troubleshooting and operations
playbooks for AI API failures, agent-tool failures, context or quality
regressions, incident triage, and rollback with closeout. Each decision path
captures privacy-safe evidence, shared retry budgets, accountable ownership,
stop conditions, postcondition verification, and bounded recovery without
destructive automation or blind retries.

Release `0.35.0` adds five provider-neutral evaluation and safety playbooks:
an evaluation-plan charter, representative dataset ledger, evidence-based rubric,
bounded red-team rules of engagement, and a human-controlled release gate. Each
resource defines prerequisites, reusable evidence, accountable ownership and
cadence, blocking stop criteria, verification, recovery, and current primary
sources without allowing automated production approval.

Release `0.34.0` adds the consolidated acceptance gate for all eleven provider
workflow references. Its exact-membership manifest enforces three Anthropic,
three OpenAI, three Google, and two four-provider resources; environment-only
provider credentials; stable metadata; primary sources; freshness; expected
evidence; verification and recovery guidance; and reusable artifacts free of
common destructive command patterns.

Release `0.33.0` adds three current Gemini Interactions API references and two
portable cross-provider workflows. The release covers first requests, functions,
structured output, evaluation and error triage, runtime configuration, and
evaluation-led migration without claiming false API equivalence. All five
resources include environment-only credentials, explicit state and retention
choices, expected evidence, verification, bounded recovery, and current
first-party sources.

Release `0.32.0` adds six source-backed Anthropic and OpenAI workflow
references for first API requests, schema-constrained outputs and tools,
evaluation, and error triage. Copyable examples use environment-only
credentials and reviewed model configuration, while every workflow defines
prerequisites, expected evidence, verification, bounded recovery, ownership,
freshness cadence, and current first-party sources.

Release `0.31.0` adds the consolidated acceptance gate for the eleven AI
coding-agent and MCP operational guides. The exact-membership manifest verifies
stable discovery metadata, registered primary sources, provider coverage,
expected evidence, verification and recovery guidance, credential safety, and
reusable artifacts free of common destructive command patterns.

Release `0.30.0` adds five MCP and orchestration field guides covering protocol
roles and lifecycle, server trust review, safe tool contracts, orchestration
pattern selection, and evidence-preserving handoffs. The reusable aids make
identity, authority, data boundaries, side effects, verification, and rollback
explicit without instructing learners to install unreviewed servers.

Release `0.29.0` adds six AI coding-agent field guides covering repository
orientation, bounded work planning, least-privilege permissions, implementation
evidence loops, independent code review, and reproducible test/debug handoffs.
Each guide includes a safe reusable record, explicit expected evidence,
verification steps, and current primary sources across provider tools and
software-delivery practice.

Release `0.28.0` adds a reusable resource-pack acceptance gate. Pack manifests
bind declared IDs to source files and enforce metadata, stable slugs, provider
coverage, primary-source allowlisting, review dates, reusable artifacts, and
credential-pattern checks. A separate bounded live-link command verifies cited
pages during release without making ordinary CI depend on public sites.

Release `0.27.0` adds five research and verification field guides covering
source authority, atomic claim decomposition, citation support, reproducible fact
verification, and consequence-based review gates. The guides teach learners to
distinguish evidence from inference, seek contradiction, preserve unknowns, and
scale independent review and approval to realistic harm.

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

See [Identity providers](docs/self-hosting/identity-providers.md) and
[Cloudflare D1 deployment](docs/self-hosting/cloudflare-d1.md) to run the
account-backed API without embedding a hosted tenant in the public source.

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
  defaultLearnerDataPolicy,
  getResourceFreshness,
  restorePortableLearnerRecord,
  scoreKnowledgeCheck,
  validateLearnerDataPolicy,
} from "@project42/platform";

const freshness = getResourceFreshness(
  starterCatalog.resources[0],
  "2026-07-25",
);

const policyCheck = validateLearnerDataPolicy(defaultLearnerDataPolicy);
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

# Project 42 Platform

The open-source learning core and content model powering
[Project 42](https://project-42.dev).

Project 42 is designed for people learning AI for the first time and practitioners
who need trustworthy, current references. This repository contains the reusable
contracts—not the private PMO records or Project42dev production configuration.

## 🚀 Quick Start: Run the Unified Open-Source Web Portal

Project 42 includes a host-agnostic public portal for Learn, Field Guide, and
learner profiles. Gallery and the role-protected Admin console are deliberately
separate deployments.

### 1. Build and Run Locally (Zero Backend Required)
```bash
# Install dependencies
npm ci

# Build the complete static portal
npm run portal:build

# Preview with any static web server
npx serve dist/portal
```
Visit `http://localhost:3000` to explore all 12 learning paths, 94 assessed modules, and 83 field guide resources.

### 2. Turnkey Docker Compose Deployment
```bash
cd self-host
docker compose up -d
```
- **Web Portal**: `http://localhost:3000`
- **Platform API**: `http://localhost:8787`
- **Identity & SSO (Keycloak)**: `http://localhost:8080`

### 3. White-Label Theming & Custom Courses
Custom branding is configured in `project42.config.json`. See the [Portal Theming & Self-Hosting Guide](docs/self-hosting/portal-and-theming.md).

---

## Included

- A typed, validated catalog for resources, learning paths, modules, and checks.
- Rich resource discovery metadata with derived freshness, editorial ownership,
  stable slugs, typed audiences, formats, prerequisites, and review policy.
- Modular curriculum files with hands-on activities and instructor-ready narration,
  scene, checkpoint, assessment, caption, transcript, and reduced-motion packages.
- Provider-neutral class-script and immutable virtual-instructor media contracts
  with multi-model provenance, independent verification, accessibility, and human
  release gates, plus a deterministic class-readiness registry that distinguishes
  complete teaching packages from production outlines
  ([production guide](docs/virtual-instructor-production.md)).
- A primary-source registry and freshness gate for volatile
  content.
- Provider-neutral curriculum with Anthropic, OpenAI, and selected-provider branches.
- Pure assessment scoring and learner-progress functions.
- Versioned learning commands, immutable retry-safe events, deterministic
  progress/transcript/badge projection, and a shared D1/PostgreSQL storage
  conformance harness.
- Cryptographically verified learner-record exports, pseudonymous idempotent
  deletion receipts, and backup deletion-replay evidence.
- A fail-closed recovery promotion gate covering verified restore, post-backup
  deletion replay, transcript and badge rebuild, corrupt-backup rejection, and
  measured recovery objectives.
- Portable JSON learner-record backup/restore, CSV transcripts, capstone evidence,
  and badge derivation.
- A recent-authentication, self-scoped authoritative account CSV transcript with
  typed JSON-export records, audit evidence, spreadsheet-injection protection,
  and explicit separation between learning achievements and issued credentials.
- A versioned learner-data lifecycle policy covering consent, retention, recovery,
  export, deletion, role boundaries, and hosted/self-host adapter requirements.
- A provider-neutral OIDC Worker API with approval states, exact-domain rules,
  owner administration endpoints, D1 migrations, progress synchronization, and
  append-only authorization audits.
- Server-side OIDC Authorization Code with PKCE, nonce and state binding,
  rotating opaque sessions, secure HttpOnly host cookies, CSRF origin checks,
  account-state invalidation, and audited sign-out
  ([browser-session guide](docs/browser-sessions.md)).
- Versioned, machine-readable content-maintenance evidence, impact, Foundry role,
  multi-model execution, deterministic gate, rollback, and human approval contracts.
- Evidence-backed contributor-credit packages with stable provider identity,
  consent and deletion boundaries, AI-assistance disclosure, public export, and
  equivalent accessible Learn and Field Guide rendering contracts.
- Provider-neutral identity-client provisioning plans, durable lifecycle records,
  secret-manager adapters, resumable owner gates, drift detection, rollback, and
  provider compatibility contracts.
- A resumable provisioning engine with compare-and-set state persistence,
  idempotent execution, authority-proof verification, provider recovery, rotation,
  upgrade reconciliation, disablement, and retirement.
- A concrete Keycloak Admin REST adapter with exact client reconciliation,
  secret-sink isolation, discovery and credential verification, callback and
  least-privilege drift detection, overlapping rotation, recovery, disablement,
  and retirement.
- Seed content suitable for a hosted site or self-hosted installation.

Release `0.68.0` adds a durable, provider-neutral account notification outbox.
Registration receipts, durable paged approved-owner alert intents, and learner
lifecycle decisions are enqueued atomically with their authoritative account
changes. Explicit
pending, delivering, delivered, retryable, and dead-letter states provide
leased concurrency, bounded retry, crash recovery, stable idempotency, and
privacy-safe audit evidence. Accessible text and HTML templates contain minimum
data and no sign-in links or tracking. Runtime-enforced delivery deadlines
retain unknown outcomes under lease, pre-bootstrap fan-outs wait for the first
approved owner, and owner-authorized recovery creates an immutable linked
replacement for a dead letter. Hosted service bindings and the packed
self-host module loader expose explicit adapter injection points while delivery
remains disabled by default; no notification vendor, service, secret, or DNS
dependency is chosen.
D1 migration `0016_account_notification_outbox.sql` and PostgreSQL migration
`013_account_notification_outbox.sql` provide matching persistence and guards.
See [Account notification outbox](docs/account-notifications.md).

Release `0.65.0` separates account requests from learner authorization. Pending
and rejected OIDC callbacks receive only a digest-backed, installation-scoped
status receipt; approved accounts alone can create or renew learner sessions.
Each repeated request replaces the prior receipt, every account-state transition
invalidates outstanding receipts, and live account-state checks revoke stale
pre-boundary sessions. Direct bearer access also fails closed across every
protected learner route; only recently authenticated consent withdrawal, private
export, and deletion rights remain available before approval. Database-enforced
compare-and-set transitions reject concurrent stale owner decisions without
contradictory audit evidence. D1 migration
`0014_registration_boundary.sql` and PostgreSQL migration
`011_registration_boundary.sql` provide the matching hosted and self-hosted
contracts.

Release `0.67.1` adds privacy-safe server diagnostics for failed browser
ID-token validation. Production logs distinguish nonce, authorized-party,
authentication-time, and signed-JWT claim failures without recording token or
claim values; the browser continues to receive the same sanitized error. No
database migration or identity-validation requirement changes.

Release `0.67.0` adds explicit hosted export record types and a
recent-authentication, approved-account CSV transcript generated directly from
durable progress, assessment, and learning-achievement records. The export is
self-scoped, audited, deterministic, spreadsheet-injection protected, and
labels learning achievements as evidence rather than issued credentials. No
database migration is required; the existing learning-record, session, and
self-host compatibility contracts remain unchanged.

Release `0.66.3` invokes stored provider fetch functions without an object
receiver, preserving the Cloudflare runtime's required Web API calling
convention for OIDC sign-in and GitHub identity linking. Release `0.66.2`
keeps browser OIDC token exchange bounded without depending on a
runtime-specific static timeout signal. It retains non-forwarding manual
redirect handling and privacy-safe transport diagnostics. Release `0.66.1`
introduced those redirect and diagnostic boundaries. Release `0.66.0` added
deterministic scale and query-plan gates
for owner account and audit pagination. Large multi-tenant fixtures traverse
more than 1,200
accounts and 1,800 audit events for the target installation while the exact D1
and PostgreSQL-compatible statements must select complete keyset indexes. The
account query avoids whole-role-table materialization without changing the
opaque cursor or response contracts. Hosted D1 migration
`0015_admin_pagination_indexes.sql` and self-hosted PostgreSQL migration
`012_admin_pagination_indexes.sql` provide the matching indexes.

Release `0.64.0` adds bounded cursor pagination to owner account and audit
administration. Existing `accounts` and `events` arrays remain stable while
page metadata supplies deterministic continuation; opaque cursors are bound to
the installation, query, and account-state filter, and owner authorization runs
before cursor parsing. Current cursors encrypt and authenticate that state with
a deployment key derived from `SESSION_ENCRYPTION_KEY`. Cloudflare D1 and
PostgreSQL use equivalent ordering and continuation contracts. The release also
promotes the reference Keycloak profile
to an executable browser-session gate covering authorization code, S256 PKCE,
nonce and state binding, callback exchange, Secure HttpOnly host cookies,
issuer-and-subject account continuity, session rotation, sign-out, and
revocation. No database migration is required: hosted D1 remains at `0013` and
self-hosted PostgreSQL remains at `010`.

Release `0.63.0` adds learner profile and account-control contracts. Profiles
now persist validated locale, time-zone, reduced-motion,
and high-contrast preferences across hosted storage, exports, and
account-merge recovery. New consent decisions use a canonical purpose and
policy-version vocabulary while explicitly marked legacy records remain
compatible with migration, export, merge, and rollback. Account deletion now
returns a private capability receipt whose digest-only status check remains
available after identity and account erasure without retaining learner PII.
Self-service endpoints also fail closed and audit attempts to select another
account, installation, user, or tenant. D1 migration
`0013_profile_consent_and_deletion_receipts.sql` and PostgreSQL migration
`010_profile_consent_and_deletion_receipts.sql` provide the matching hosted and
self-hosted schema changes.

Release `0.62.0` makes duplicate-account reconciliation fail closed for
suspended accounts and for non-overridable required-consent, retention-policy,
and legal-hold blocks. Preview identifies the affected account and policy
without exposing raw authority references; completion rechecks live policy,
records denied audit evidence, and preserves progress, attempts, transcripts,
badges, mastery records, and rollback recovery. D1 migration
`0012_account_merge_governance_constraints.sql` and PostgreSQL migration
`009_account_merge_governance_constraints.sql` add the provider-neutral,
immutable governance-constraint ledger. This release also packages the merged
instructor, self-hosted model operations, reliable-agent, and agentic-AI
curriculum candidates while retaining their human publication gates.

Release `0.61.0` makes the hosted progress API use the append-only learning-event
stream as its read and write authority. Browser-local and portable imports become
idempotent `progress.imported` events, existing hosted snapshots are promoted
lazily without a second database, and the historical progress tables remain only
as rebuildable compatibility projections for current exports and account merges.
The `1.1` event contract remains able to read stored `1.0` events.

Release `0.60.0` replaces browser bearer-token storage with an OIDC
Authorization Code and PKCE boundary owned by the API. Encrypted one-time
transactions bind state, nonce, verifier, return target, and expiry; signed ID
tokens must contain fresh `auth_time` evidence. Opaque session identifiers are
stored only as SHA-256 digests, rotate atomically with audit evidence, expire
absolutely, and are invalidated by suspension, revocation, account merge, and
rollback. Host-only Secure HttpOnly cookies, exact-origin credentialed CORS,
origin checks on cookie mutations, invalid-cookie recovery, bounded cleanup,
and matching D1/PostgreSQL schema guards complete the boundary.

Release `0.59.1` adds a fail-closed learning-record recovery promotion gate and
brackets the actual recovery operation with its runtime RTO clock.
Verified exports are checked before any restore write; corrupt and incomplete
backups are rejected; restored event semantics and order are compared while
allowing new database-assigned sequence values; transcripts and badges are
rebuilt; post-backup deletion receipts are replayed before promotion; and
measured recovery point and recovery time must remain within declared
objectives. The reference gate uses local ephemeral D1 and consumes no
Cloudflare account database quota.

Release `0.58.1` adds a checksum-bound remote D1 migration runner for the
Project 42 schema. It validates exact migration order, rejects previously
applied SQL drift, applies each migration and its ledger records together, and
requires explicit operator adoption before binding a pre-existing Wrangler
ledger. This preserves trigger-bearing migrations without weakening the
production deployment gate.

Release `0.58.0` completes the hosted D1 learning-record adapter boundary.
Hosted and self-hosted runtimes select their adapter through validated,
fail-closed configuration; `/health` exposes only the provider-neutral contract
version and semantic fingerprint. The same combined conformance report now runs
against D1 and PostgreSQL and an explicit parity gate rejects semantic drift.
An executable D1 reference measurement and documented production thresholds
cover transaction size, latency, overload, and capacity headroom.

Release `0.57.0` completes the PostgreSQL learning-record adapter receipt boundary.
Verified exports bind the exact event stream, revision, and learner scope;
idempotent deletion writes a durable pseudonymous receipt before removing events;
and backup replay records the restored event digest and deletion outcome without
retaining raw learner or installation identifiers. A public receipt conformance
suite now runs alongside the learning-event suite on Cloudflare D1 and
PostgreSQL 17.

Release `0.56.0` adds the authoritative learner-event contract and shared hosted
and self-hosted storage conformance suite. Caller-generated idempotency keys
prevent duplicate writes while distinct concurrent assessment attempts retain
their original answers and scores. Append-only corrections preserve historical
evidence, deterministic projections rebuild progress, transcripts, and badges,
and D1 plus PostgreSQL migrations enforce tenant boundaries and immutable event
rows. The public harness validates retry, authorization, export, and governed
deletion behavior for replacement adapters.

Release `0.55.0` adds the executable Keycloak reference adapter for self-hosted
identity-client provisioning. The adapter uses a caller-supplied administration
token, verifies the configured tenant-authority digest, reconciles exact OIDC
callbacks and web origins, prevents broad client permissions, sends generated
credentials directly to the injected secret sink, checks discovery and credential
state, and implements rotation, recovery, disablement, and retirement through the
current Keycloak Admin REST API.

Release `0.54.0` adds the resumable identity-provisioning engine. It resumes
provider operations across process restarts, binds authority decisions to expiring
SHA-256 continuation proofs, prevents duplicate clients, sends raw credentials only
to the injected secret sink, fails closed on post-provider drift, and records every
attempt and transition. Deterministic tests prove API and owner-gated deployment,
rerun, denial, expiry, outage recovery, callback-drift recovery, rotation, upgrade,
disablement, retirement, and unsupported-capability rejection.

Release `0.53.0` adds the identity-client provisioning contract used by hosted and
self-hosted installers. It supports backend APIs, bounded owner/admin gates, and
validated preconfiguration without exposing credentials. Versioned plans and
records cover idempotency, exact callbacks, least privilege, secret rotation,
post-registration observation, drift, recovery, retirement, audit evidence, and
fail-closed readiness.

Release `0.52.0` adds the provider-neutral contributor-credit contract. It binds
human roles to stable provider identity and accepted repository evidence,
survives username changes, discloses accountable AI assistance, removes private
identity from public exports, and gives Learn and Field Guide an equivalent
accessible rendering contract. Consent revocation and account deletion preserve
change integrity while suppressing public identity.

Release `0.50.0` adds the first six class-ready AI Foundations teaching
packages. Each provides substantial read-aloud instruction, complete section
coverage, demonstrations, prompts, checkpoints, corrective feedback, exact
activity and assessment handoffs, accessible visual direction, deterministic
WebVTT captions, transcripts, text-only and reduced-motion alternatives, and
integrity evidence. A generated coverage registry distinguishes complete
classes from production outlines; publication remains gated on independent
model-role work and accountable human approvals.

Release `0.49.0` adds the first independently deployable self-host
infrastructure profile: a non-root OCI account API, PostgreSQL adapter and
checksum-locked migrations, reference Keycloak OIDC configuration, backup and
restore guidance, fail-closed production configuration, and Linux integration
and Compose smoke gates. Release archives and OCI images are signed with
short-lived Sigstore identities and publish verifiable provenance.

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

See [Contributor-credit packages](docs/contributor-credit.md) to record accepted
content evidence and render consented public attribution.

See [Identity providers](docs/self-hosting/identity-providers.md) and
[Cloudflare D1 deployment](docs/self-hosting/cloudflare-d1.md) to run the
account-backed API without embedding a hosted tenant in the public source.
The [owner administration pagination contract](docs/owner-administration-pagination.md)
defines bounded account and audit queries, stable continuation, client migration,
and the owner/installation security boundary.
The [role and tenant authorization contract](docs/authorization-boundaries.md)
defines the learner/owner permission matrix, fail-closed role and installation
checks, privacy-safe audit boundary, and future-role extension gate.
The [hosted learning-record adapter guide](docs/hosted-learning-record-adapter.md)
defines adapter selection, cross-database parity, measurement, and operating
thresholds.
The [learning-record recovery gate](docs/learning-record-recovery.md) defines
serialized backup manifest and checksum verification, migration-head matching,
deletion replay, exact projection comparison, 24-hour/8-hour objective
measurement, PostgreSQL/D1 rehearsal parity, and quota-safe boundaries.

For a local PostgreSQL and reference-OIDC evaluation stack, follow the
[Docker Compose deployment guide](docs/self-hosting/docker-compose.md). The
guide states the production boundary explicitly and includes backup and
restore-test procedures.

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

# Content freshness pipeline

Project 42 treats freshness as a monitoring and evidence problem, not a
one-time fact-check at authoring time. This document describes the pipeline
that is meant to turn a changed primary source into a reviewed, evidence-
linked update: the sequence of steps a source change goes through, the
quality stages a proposal must pass, the metrics used to measure the pipeline
itself, and the safety constraints that apply to any code or model that
touches fetched source text.

This document does not restate the data model. See
[Governed content-maintenance contracts](content-maintenance-contracts.md)
for the field-level schemas a content-change packet, Foundry role profile,
and maintenance proposal must satisfy, and for how impact analysis maps a
source to the Learn modules, Field Guide resources, assessment questions, and
instructor-package modules it affects.

## Required monitoring sequence

A source change is meant to move through eight steps before it can become a
proposal:

1. Fetch only allowlisted URLs with fixed limits, timeouts, content types,
   and a declared user agent.
2. Store retrieval metadata and a normalized document hash. Never execute a
   fetched source's scripts.
3. If the hash changes, produce a deterministic structural or text diff.
4. Map the source ID to the content IDs that cite it.
5. Open an evidence packet containing the old and new hashes, retrieval
   dates, changed sections, affected content, and a risk class.
6. Route the evidence packet through the governed multi-model quality stages
   below, treating all fetched text as untrusted data.
7. Run catalog, freshness, citation, assessment, accessibility, build, and
   route tests.
8. Create an evidence-linked proposal, an issue, and a draft pull request. A
   named maintainer must approve and merge it.

## Governed multi-model quality stages

The pipeline must not let one model research, write, fact-check, and approve
its own output. A private, governed model and media execution environment
can supply approved model deployments and an execution harness; this
repository supplies the role contracts, evidence rules, tests, and human
release authority that constrain how those deployments may be used.

| Stage | Responsibility | Required independence |
| --- | --- | --- |
| Deterministic monitor | Fetch, normalize, hash, diff, and map affected content | No model; allowlisted code path |
| Evidence researcher | Read primary sources and build a claim/evidence/impact packet | Distinct deployment from the writer |
| Curriculum and guide writer | Draft original, accessible instruction from the evidence packet | Cannot add unsupported factual claims |
| Factual and citation verifier | Independently verify each changed volatile claim and citation | Different model/provider family from the writer |
| Assessment reviewer | Check answer validity, distractors, explanations, and impact | Separate role and contract |
| Accessibility reviewer | Check structure, narration, captions, transcripts, and reduced motion | Model review plus deterministic accessibility gates |
| Release proposer | Summarize evidence, disagreements, risks, preview, and rollback | Cannot approve or publish |
| Human maintainer | Resolve ambiguity and approve, reject, or request revision | Sole publication authority |

The middle six stages, evidence research through release proposal, are the
same six stages that `foundry-role-profile.schema.json` and
`maintenance-proposal.schema.json` require every proposal to record. Every
publication candidate uses at least three distinct approved model
deployments. The writer and the final factual verifier must come from
different model or provider families. A disagreement is never resolved by
majority vote: contradictory evidence, missing primary sources, unsupported
claims, or an unresolved verifier finding blocks the proposal and routes it
to a human.

### Model selection

No role permanently hard-codes one "best model." A role profile is a
versioned record, qualified against held-out fixtures before it is trusted,
and it can name fallback deployments as well as a primary one. Candidate
model families are not restricted to a single vendor; a candidate wins a role
only by meeting that role's quality threshold on the qualification fixtures,
not by provider preference. Qualification should test, at minimum:

- long-form instructional clarity and faithful restructuring;
- primary-source research recall and provenance completeness;
- planted false claims, subtle date or version errors, and citation
  mismatches;
- conflicting sources and explicit uncertainty;
- prompt injection and untrusted-source instructions;
- accessibility defects and missing alternative formats;
- invalid assessment keys, plausible distractors, and explanation quality;
  and
- latency, cost, context limits, structured-output reliability, and failure
  recovery.

Each stage records its deployment alias, model or provider family, version,
role-contract version, parameters, evidence digest, output digest, latency,
cost, and evaluation result. See `maintenance-proposal.schema.json`'s
`modelStage` definition, described in
[Governed content-maintenance contracts](content-maintenance-contracts.md),
for the exact fields. The record excludes secrets, learner data, hidden
reasoning, and unrestricted source snapshots.

### Publication gate

A proposal is not publishable unless:

1. every new or changed volatile claim maps to current primary-source
   evidence;
2. the independent factual verifier has no unresolved blocking finding;
3. citations resolve and their scopes actually support the associated
   claims;
4. accessibility and assessment contracts pass;
5. schemas, content validation, builds, routes, links, and tests pass;
6. preview and rollback evidence exist; and
7. a named human approves the pull request.

Models may propose, criticize, and revise. They may not approve, merge, tag,
deploy, close tracked work, or publish. `validateMaintenanceProposal` (see
[Governed content-maintenance contracts](content-maintenance-contracts.md))
enforces the schema-level version of this gate; the list above is the
pipeline behavior that is meant to produce a proposal capable of passing it.

## Draft issue fields

An opened freshness issue is meant to record:

- the source registry ID and canonical URL;
- the previous and current retrieval timestamp and content hash;
- a deterministic diff summary with bounded excerpts;
- the affected catalog IDs and assessment IDs;
- a suggested action: irrelevant, review, urgent correction, or source
  unavailable;
- per-stage model deployment or family, role contract, evaluation result,
  and evidence digest when AI is used;
- cross-model disagreements and their human disposition; and
- reviewer, decision, release version, and rollback reference.

## Evaluation metrics

These metrics measure the pipeline itself, not any single proposal:

| Metric | Definition |
| --- | --- |
| Precision | Relevant alerts divided by all alerts |
| Recall | Detected relevant changes divided by known relevant changes |
| Reviewer minutes | Median human time from alert to disposition |
| Citation coverage | Proposed factual changes with primary-source evidence |
| Assessment impact accuracy | Correctly identified affected questions |
| Correction rate | Published updates requiring correction |
| Source failure rate | Fetches blocked, removed, redirected, or malformed |
| Verifier escape rate | Planted or known factual defects missed by the independent verifier |
| Unsupported-claim rate | Draft claims without accepted primary-source evidence |
| Model disagreement rate | Proposals requiring evidence review or human adjudication |

## Safety constraints

- Source text never becomes a system or developer instruction.
- No fetched HTML executes.
- Excerpts are length-limited and provenance-labeled.
- AI output cannot close an ambiguous alert, merge, tag, or deploy.
- No model can approve its own output or act as both writer and final
  verifier.
- No unreviewed AI-generated content is published.
- Removed or contradictory sources escalate to a human.
- Stored snapshots follow copyright and retention review; hashes and diffs
  are preferred over long-term full-text storage where possible.
- Monitoring obeys published terms, robots policies, and reasonable rate
  limits.

## Current implementation status

The schemas a freshness proposal must satisfy exist and are validated:
`content-change-packet.schema.json`, `foundry-role-profile.schema.json`, and
`maintenance-proposal.schema.json`, described in full in
[Governed content-maintenance contracts](content-maintenance-contracts.md).
What runs today stops well short of the pipeline described above.

`content/source-registry.json` is real and shipped. It records a versioned
list of primary sources, each with a publisher, trust tier, review cadence in
days, and an owning team, matched to catalog content by URL prefix.

`scripts/check-freshness.mjs`, run with `npm run content:freshness`, is real
and shipped, and it is the only automated freshness check that currently
runs. It does exactly one thing: for every source URL cited by a module or
resource, it looks up the matching registry entry, confirms the publisher
matches, and compares the citation's recorded `lastVerified` date against
that source's `reviewCadenceDays`. A citation older than the cadence fails
the check; one within 80 percent of the cadence produces a warning. That is
the entire implementation. It does not fetch the source URL. It does not
hash or diff anything. It does not detect that a source actually changed; it
only detects that nobody has re-verified a citation recently enough.

None of the following exist yet:

- a source-change detector that performs steps 1 through 3 of the required
  monitoring sequence above (allowlisted fetch, hash, diff);
- code that opens an evidence packet, a content-change packet, or a
  maintenance proposal from `check-freshness.mjs` output;
- an orchestrator that runs the governed multi-model quality stages; or
- anything that consumes a freshness failure or warning to trigger a
  generation run, open an issue, or create a pull request.

In short, the loop is not closed. `check-freshness.mjs` reports staleness by
date; nothing currently reads that report and acts on it. A self-hoster who
wants to build this pipeline today has the schemas and the review-cadence
check to build on, not a working end-to-end system.

# Governed content-maintenance contracts

Project 42 treats content automation as an evidence-linked proposal system. It does
not let a model publish, merge, approve, deploy, or close work.

This document defines the schemas a proposal must satisfy. See the
[content freshness pipeline](content-freshness-pipeline.md) for the process that is
meant to produce one: the monitoring sequence, the quality stages, and an honest
account of how much of that process actually runs today.

The reusable contracts in `schemas/content-maintenance/` separate three concerns:

1. `content-change-packet.schema.json` records deterministic source observations,
   bounded diffs, claim evidence, and canonical Learn/Field Guide impact.
2. `foundry-role-profile.schema.json` maps each qualified maintenance role to an
   approved Foundry deployment alias and tested fallbacks.
3. `maintenance-proposal.schema.json` records bounded repository targets, every
   model-stage execution, deterministic gates, conflicts, rollback, and the human
   decision.

All schemas use version `1.0`, reject unexpected properties, and have positive and
negative fixtures under `tests/fixtures/content-maintenance/`.

## Impact analysis

`buildContentImpactAnalysis` maps one registered canonical source URL to:

- Learn module IDs;
- Field Guide resource IDs;
- knowledge-check question IDs; and
- instructor-package module IDs.

`validateContentChangePacket` recomputes that mapping from the canonical catalog.
Agent output cannot silently omit or invent affected content. Changed observations
must contain bounded diffs. Volatile claims without supporting evidence, conflicting
claims, missing evidence, and impact drift fail closed.

Source text is data, never an instruction. Packets retain hashes and short excerpts
rather than hidden reasoning or unrestricted source snapshots.

## Multi-model stages

Every governed proposal records all six stages:

| Stage | Contract responsibility |
| --- | --- |
| Evidence research | Build the primary-source claim and impact packet |
| Curriculum writing | Draft only from accepted evidence |
| Factual verification | Independently check changed volatile claims and citations |
| Assessment review | Revalidate answers, distractors, explanations, and mastery evidence |
| Accessibility review | Revalidate narration, captions, transcript, structure, and alternatives |
| Release proposal | Assemble evidence, preview, risk, and rollback for a human |

At least three distinct deployment aliases are required. Research and writing use
different deployments. The writer and final factual verifier must use different
provider families. Disagreement is not settled by majority vote: unresolved conflict
blocks publication.

The contract records deployment alias, provider family, model version, role-contract
version, parameters, input/output digests, latency, cost, status, and bounded
findings. It deliberately excludes secrets, live tokens, learner data, and private
reasoning.

## Foundry role profiles

Project 42 does not permanently hard-code a model name for a role. A role profile
selects deployment aliases only after a held-out benchmark qualifies them.
`validateFoundryRoleProfile` can compare every primary and fallback alias with the
deployment inventory supplied by Homestead Foundry.

The benchmark and private inventory decide which current model fills a role.
Provider family independence and quality thresholds remain stable even as model
versions change.

## Publication gate

`validateMaintenanceProposal` returns both structural validity and `publishable`.
A proposal is publishable only when:

- every required model stage passed;
- every deterministic gate passed;
- no unresolved conflict remains;
- a rollback plan exists; and
- a human reviewer reference and decision timestamp record explicit approval.

A valid proposal with a pending human decision is intentionally not publishable.
Homestead Foundry may execute qualified roles and produce a draft proposal, but it
cannot manufacture the human approval required by this contract.

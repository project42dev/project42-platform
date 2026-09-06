# How the curriculum stays current

If you are studying this material, or deploying it to other people, you are
entitled to know where it came from and how it is kept true. This page answers
that. It is a trust document: it describes the method, names the person who
approves what gets published, and states plainly what the method does **not**
guarantee.

It deliberately does not describe how to run the maintenance system. See
[What is not documented here](#what-is-not-documented-here) at the end.

## The short version

- Curriculum is not hand-written once and left alone. An automated maintenance
  system continuously looks for material that should exist and re-checks
  material that already exists.
- That system is operated by the project owner. It is not part of the
  open-source product, and you do not need it to run Project 42.
- **Nothing it produces reaches a learner without a person approving it.** A
  human authority gate stands between the machine and you, twice.
- Every module cites its sources, and every citation carries the date it was
  last verified. Those dates are enforced by the build.
- Published curriculum lands in the
  [`project42dev/project42-content`](https://github.com/project42dev/project42-content)
  repository. This platform pulls from there and rebuilds.

## Where the material comes from

Candidate material is drawn from a registry of vetted primary sources, not from
open web search and not from a model's memory. The registry ships in this
repository at `content/source-registry.json`, so you can read the whole list.
Each entry records:

- the publisher and the URL prefix that identifies the source;
- a trust tier, which is `primary` for first-party documentation and research;
  and
- a review cadence in days, which is how often a citation to that source must
  be re-verified before the build considers it stale.

Cadences are set per source rather than globally, because provider
documentation moves faster than a standards framework. Anthropic and OpenAI
platform documentation carry a 30-day cadence; the NIST AI Risk Management
Framework carries 180.

**Every module in the shipped curriculum cites its sources.** At the time of
writing that is 88 of 88 modules. Citations are part of the module file, not a
bibliography bolted on afterwards, and they name the publisher and the exact
URL.

## The two tracks

The maintenance system works along two tracks. They answer different questions
and they run on their own schedules.

**Discovery** asks *what should exist that does not*. It surveys the approved
source registry for material the curriculum does not cover, scores what it
finds, and proposes it as candidate work.

**Currency** asks *is what we already published still true*. It inspects the
published corpus against the same sources, and records both material that needs
updating and material that has stopped being accurate and should be withdrawn.

Both tracks produce **evidence, not decisions**. A run's output is a list of
findings with the reasoning attached. Neither track can publish, edit
curriculum, or close its own work.

A third path, **request intake**, carries a reader's request into the same
queue. See
[Asking for content, or challenging it](#asking-for-content-or-challenging-it).

The flow, including both approval gates, is drawn in
[`docs/diagrams/orchard-lifecycle.mmd`](diagrams/orchard-lifecycle.mmd), which
is also published as a learner-facing diagram in the curriculum's governance
category.

## Nothing is published without a person approving it

This is the most important fact on the page, so it gets its own section.

There are two gates, and both are human.

**Gate 1 comes before any authoring happens.** Findings from either track are
posted for the owner with their scoring and their evidence. Work that is not
approved never reaches a model at all. This ordering is deliberate: approval
governs scope and spend *before* effort is spent, not after.

**Gate 2 comes before anything is published.** Once material has been drafted
and reviewed, the owner approves or denies that exact draft. Approval is bound
to the specific artifact: editing the draft after approval invalidates the
approval, so a person cannot approve one thing and have another thing ship. A
denial carries a reason and returns the work for rework rather than discarding
it.

Models draft, criticise, and revise. **Models do not approve, merge, deploy,
tag, or publish.** That constraint is not only a policy statement; any proposal
validated against this repository's schemas is rejected without it. See
[Governed content-maintenance contracts](content-maintenance-contracts.md): a
proposal is not publishable until every model stage has passed, every
deterministic gate has passed, no conflict is unresolved, a rollback plan
exists, and a named human has recorded an explicit approval with a timestamp. A
structurally valid proposal with a pending human decision is intentionally not
publishable.

The drafting is not meant to be a single model talking to itself. The contract
requires distinct roles — evidence research, writing, independent factual
verification, assessment review, accessibility review — to be held by different
model deployments, and requires the writer and the final factual verifier to
come from different provider families. Disagreement may not be settled by
majority vote; an unresolved conflict blocks publication and routes to a person.
A proposal that does not record every stage is not publishable. Note that this
is a contract the schemas enforce on a proposal, not an orchestrator that ships
in this repository, and not every role in it has an implementation yet. The full
role contract, and an honest account of what runs, is in
[the content freshness pipeline](content-freshness-pipeline.md).

## How you can see freshness for yourself

Freshness is recorded in the content, not asserted in marketing copy.

- Each module carries a `lastVerified` date and a `reviewCadenceDays` value.
- Each source citation inside a module carries its own `lastVerified` date.
- The platform derives a freshness status at read time — `current`,
  `review-due`, or `stale` — from the verification date and the cadence, rather
  than storing a status that could itself go stale. That derivation is
  `getResourceFreshness` in `src/resource.ts`.

This is enforced, not advisory. `npm run content:freshness` checks every source
URL cited by a module or resource against its registry entry, confirms the
publisher matches, and fails when a citation is older than that source's
cadence. It runs as part of `npm run check`, which runs in CI on every change
and again at release. A citation that nobody has re-verified in time **breaks
the build**.

Two honest caveats about that check:

- It compares dates. It does not fetch the source, hash it, or diff it, so it
  detects *"nobody has re-verified this recently"* and not *"this source
  changed"*. Automated change detection is designed and not built; the gap is
  documented in detail in
  [the content freshness pipeline](content-freshness-pipeline.md).
- The dates and citations are in the content files and in the catalog data. As
  of this writing, no component in this repository renders a "last verified"
  badge on a module page. A site built on this platform can surface it — the
  data and the derivation are both available — but it is not on the page by
  default.

## Where published material lands, and how a site picks it up

The canonical curriculum lives in
[`project42dev/project42-content`](https://github.com/project42dev/project42-content).
This repository holds no curriculum of its own; it installs the content
repository's files and records the exact upstream commit, content version, and
a SHA-256 of every installed file in `config/content.lock.json`.

A site rebuilds on any of three triggers:

1. a weekly schedule;
2. a manual operator run; and
3. a `content_updated` repository event, dispatched when an authoring run
   finishes.

That third trigger is the handoff point between the maintenance system and the
open-source product: the maintenance system's responsibility ends when it has
dropped content into the content repository and fired the event. Everything
after it — pull, validate, build, deploy — is this repository's job and is fully
open. The mechanics are in
[Universal content synchronization](content-synchronization.md).

## Asking for content, or challenging it

If you think something is missing, wrong, or out of date, say so. Requests for
curriculum go to the repository that holds it: open a **content request** on
`project42-content`, which offers a form whose fields the intake reads
directly. For a question rather than a defect, use GitHub Discussions.
[SUPPORT.md](../SUPPORT.md) describes the routes and what to include.

What happens next:

- A scheduled run reads issues carrying the `content-request` label and turns
  each into a candidate, carrying the originating issue number with it.
- That candidate joins the same queue, and faces the same Gate 1, as anything
  discovery or currency produces. A request is not a shortcut past approval.
- If it is approved and authored, the originating issue receives a comment
  naming the published module.

Two parts of that chain still need a person, and this page will say so until
they do not: moving approved candidates into the registry, and posting the
comment back to the issue. Both are implemented as commands an operator runs;
neither is yet triggered automatically.

A request never bypasses scoring or the approval gates, by design. There is no
fast lane.

## Honest limits

State these to yourself before you rely on the curriculum for anything that
matters.

- **Coverage is not exhaustive.** Discovery surveys an approved list of sources.
  Material published outside that list is not seen. The registry is a
  deliberate, reviewable choice, and the cost of that choice is blind spots.
- **A last-verified date means the source was checked on that date.** It does
  not mean the subject has not changed since, and it does not mean the source
  itself has not changed since. The automated check compares dates; it does not
  fetch and diff the source.
- **Human approval is a quality floor, not a guarantee of correctness.** One
  person approving a draft that several models produced and reviewed is better
  than no person. It is not peer review, and it is not a warranty.
- **Parts of the described method are designed and not built.** This page marks
  each one where it appears. The most significant is automated source-change
  detection: freshness is judged by comparing dates against each source's
  review cadence, and nothing fetches a source to see whether it actually
  changed. Treat the pipeline described in
  [the content freshness pipeline](content-freshness-pipeline.md) as the
  intended process with its status marked, not as a description of a fully
  closed loop.
- **Approved content lands in `project42-content`, and this platform consumes
  it.** Both halves are now enforced rather than merely intended: upstream, a
  publication naming any other repository fails schema validation outright;
  downstream, this repository pulls from `project42-content` hash-locked and
  holds no curriculum of its own. Until recently the upstream half was not
  true — a normalization step silently rewrote every publication back to this
  repository — which is why the two copies were able to drift apart.
- **AI is used substantially.** Discovery, research, drafting, review, and
  factual checking all involve models. This is disclosed rather than hidden;
  see [Legal and transparency requirements](product/legal-and-transparency-requirements.md).

## What is not documented here

The maintenance system that performs discovery and currency work is the
project owner's private content-maintenance system. **It is part of Project 42,
but it is not part of the open-source product, and its internals are not
documented in this repository.**

You do not need it. Project 42 is fully usable, self-hostable, and forkable
without it: the curriculum is published openly, the schemas that govern a
maintenance proposal are published openly, and any process that produces
content satisfying those schemas can feed this platform.

Deliberately out of scope on this page and everywhere else in this repository:
the system's internal lifecycle states and state machine, its queues, its
databases and migrations, its adapters and controllers, its file layout, its
infrastructure, and its run-by-run operational status. Those are operating
details. Nothing on this page requires them, and knowing them would tell you
nothing further about whether the material you are studying can be trusted.

The internal architecture decision records numbered ADR-0015 and ADR-0017
through ADR-0028 previously lived in a directory of this repository that has
now been removed.
They record decisions about that private system's internals and have moved to
the maintenance system's own repository. No decision that governs this
open-source platform moved with them.

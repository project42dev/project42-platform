# Status

**Last reconciled 2026-08-15.**

This page exists because "built" is an ambiguous word, and using it loosely is
how a project ends up believing things about itself that are not true. Four
columns, and a claim only counts when all four are green.

| Column | Question it answers |
|---|---|
| **Designed** | Is the decision made and written down? |
| **In branch** | Does the code exist on the default branch? |
| **Connected** | Is it wired into a path that actually executes? |
| **Verified** | Has it been observed working on real input? |

## Headline

**The infrastructure is deployed. No job has ever executed.** Those are two
different facts and the second is the important one. A Container Apps job is a
task definition, not a running service, so a healthy estate and a system that
has never done anything are the same picture.

On 2026-08-14 the solution was reset to a never-run state ahead of its first
full start-to-finish test. On 2026-08-15 the discovery track and the seeding
job were deployed for the first time, completing the estate.

**Nothing has ever completed the lifecycle end to end.** The publication and
rendering tables in the content database are both empty. That is the single
most useful fact on this page, and it is why several rows below stop short of
Verified.

## Where things stand

| Capability | Designed | In branch | Connected | Verified |
|---|---|---|---|---|
| Content database compiled from files | yes | yes | yes | yes |
| Model map with a refusal instead of a fallback | yes | yes | yes | yes |
| Six-role authoring ensemble | yes | yes | yes | partly, roles have run, not through a full lifecycle |
| Gate 1, holding work before any model is reached | yes | yes | yes | yes |
| Gate 2, binding publication to an artifact digest | yes | yes | yes | no |
| Currency track, inspecting the published corpus | yes | yes | yes | no |
| Discovery track, searching approved sources | yes | yes | yes, deployed 2026-08-15 | no |
| Seeding the shared inputs both tracks read | yes | yes | yes, deployed 2026-08-15 | no |
| Request intake, a third way work enters | yes | yes | no | no |
| Publication through a protected-main pull request | yes | yes | no | no |
| Portable single-template deployment | yes | yes | yes | yes |

## What has to happen before the first real run

1. ~~**Deploy the discovery track.**~~ Done on 2026-08-15. It had never been
   deployed before that day, and could not be: the release script pinned it
   off. It requires an approved source registry, which now exists and is built
   from the watch list by a script that validates its output against the
   runtime's own loader before writing it. **78 of 86 sources are enabled
   across 65 hosts.** The eight held are one whose robots.txt disallows all
   agents, and seven whose robots.txt could not be read at all, which is
   treated as refusal because unknown is not permission.
2. **Seed the shared inputs** into the private storage both jobs read: the
   canonical corpus for currency, the approved source registry for discovery.
   This is deliberately a separate action rather than a deployment step, so it
   never happens as a side effect of deploying.
3. **Regenerate briefs from the queue.** The previous brief file was removed in
   the reset, along with every other artifact of the old runs.
4. **Be present for both gates.** Neither gate can be satisfied by a schedule,
   by design.

A real run spends real money and publishes real content. Both are the point,
and neither is reversible by pretending otherwise.

## What was deliberately removed on 2026-08-14

Orchard is being treated as a new deployment, so everything a previous run
produced was deleted rather than archived in place: the work queue, the
candidate list, the generated briefs, the evidence packets, the proposal
packets, the run records, and every machine-raised notification issue.

**Inputs were kept, outputs were not.** The approved source registry, the watch
list, the hand-written brief templates and the published corpus are things an
operator supplies or maintains. Everything a run emitted is gone.

Git history retains all of it, and a baseline snapshot of the database and the
work queue is preserved under `archive/` so the first test can be judged against
what came before rather than against nothing.

## Known defects

- **The content database is committed while also listed in `.gitignore`.** The
  file is tracked, so the ignore rule has no effect on it. The repository
  currently declares the database operator-local while shipping it, and that
  contradiction needs settling before the database becomes a published artifact.

## Defects fixed on 2026-08-15

- **A missing source registry loaded as zero sources, silently.** The database
  build returned an empty list rather than failing when its input file was
  absent, so a rebuild in that state produced a discovery track that searched
  nothing and correctly reported no gaps. A missing registry is now a hard
  stop, with an explicit flag for the rare build that means to have none, and
  rows dropped for missing fields are named rather than discarded quietly.
- **The shared inputs could not be written at all.** Both storage accounts are
  private with shared keys disabled, and the estate has no bastion, VPN gateway
  or jumpbox, so nothing outside the virtual network could put a blob there.
  The design described seeding as an operator action through the private
  endpoint, which named no reachable path: both tracks fail closed without
  their inputs, so nothing could run. Seeding is now a manual-trigger job that
  runs inside the network, carries the artifacts in the release image, verifies
  each against a digest fixed at release time, and reads every blob back after
  writing. Storage is never opened.
- **Discovery could not be deployed by any configuration.** The release script
  pinned the discovery track off and refused a release in which its jobs
  existed. It is now a deployer setting, and enabling it requires an approved
  source registry that validates against the runtime's own loader.
- **The infrastructure contract had not run since the observability merge.** It
  read a template that merge deleted, so it failed on startup, and two of its
  assertions had inverted in the meantime. It runs again and covers the release
  script as well as the templates.

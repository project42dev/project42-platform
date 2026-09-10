# Universal Content Synchronization Guide

Project 42 Platform supports three independent vectors for keeping curriculum up to date:

```text
                ┌─────────────────────────────────┐
                │ 1. Scheduled Daily Cron         │
                │    (Every day 03:00 UTC)        │
                └────────────────┬────────────────┘
                                 │
┌────────────────────────┐       │       ┌────────────────────────┐
│ 2. Manual Operator     │───────┼───────│ 3. Orchard Event Push  │
│    Workflow Dispatch   │       │       │    (Webhook Dispatch)  │
└────────────────────────┘       │       └────────────────────────┘
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │ Content Sync Engine             │
                │  • Pulls project42-content      │
                │  • Records the upstream commit  │
                │  • Proves the lock names that   │
                │    commit, or fails             │
                │  • Validates schemas & quizzes  │
                │  • Builds static export bundle  │
                │  • Commits content/ and opens   │
                │    a pull request               │
                │  • Reports curriculum currency  │
                └─────────────────────────────────┘
```

## What "upstream" means

Upstream is **`project42dev/project42-content`**, the canonical content
repository named in [`architecture.md`](architecture.md) as layer 2. It is the
only source of curriculum; this repository holds no curriculum of its own.

`scripts/sync-content.mjs` installs it into `content/` and writes
`config/content.lock.json`, which records the upstream commit, the content
version, and a SHA-256 of every installed file. `npm run content:check`
re-verifies the installed tree against that lock **without network access**, so
an air-gapped build still works while editing curriculum in this repository
fails the build.

> **History.** Until 2026-09-05 this page described a pull that did not happen.
> `scripts/sync-content.mjs` never contacted the content repository — it created
> an empty `custom-content/` directory and re-ran the local generator over a copy
> of the curriculum vendored here, and the workflow step was written
> `|| echo "Content synced"` so it could not fail. The two copies drifted by a
> whole learning path and 100 KB of catalogue while both declared the same
> content version. The workflow now checks the content repository out and the
> step is allowed to fail.

---

## The 3 Sync Vectors

### Vector 1: Scheduled Daily Cron
Runs automatically every day at 03:00 UTC (`0 3 * * *`) in GitHub Actions
(`.github/workflows/content-sync.yml`), so an upstream correction is at most a
day from being proposed here without anyone touching a button.

It was weekly until 2026-09-10, and weekly was too slow to be the only live
vector: project42-content retracted a set of unearned review dates on
2026-09-06 at 18:08 UTC, fifteen hours after that week's run, and the copy here
kept serving the retracted dates until the next Sunday would have come round.

### Vector 2: Manual UI Trigger
Operators can trigger an instant content pull and build by clicking **Run workflow** under the **Content Sync & Deployment** tab in GitHub Actions.

### Vector 3: Event-Driven Upstream Webhook
When the upstream maintenance system finishes an authoring run, it dispatches a
repository event (`content_updated`) to trigger immediate ingestion and
deployment. This is the handoff point: that system's responsibility ends when it
has dropped content into `project42-content` and fired this event. Everything
after the event is this repository's job.

That maintenance system is operated by the project owner and is not part of the
open-source product. For what it does, where material is sourced from, and who
approves it before it reaches a learner, see
[how the curriculum stays current](how-content-stays-current.md).

> **This vector has no sender today.** The workflow listens for
> `content_updated`, but as of 2026-09-10 `project42dev/project42-content` has
> no `.github/workflows` directory, so nothing there dispatches the event. A
> correction committed upstream by hand — which is what the 2026-09-06
> retraction was — notifies this repository not at all, and is picked up by
> Vector 1 on the next daily run. Wiring a sender needs a cross-repository token
> held in the content repository, which it does not currently have.

---

## What lands, and what fails

The sync is only useful if its result reaches `main`, and only trustworthy if a
sync that did not happen cannot look like one that did.

**It lands.** The job commits `content/` and `config/content.lock.json` to the
`content-sync` branch and opens (or updates) a pull request. Until 2026-09-10 it
did none of that: it installed the curriculum into the runner's working tree,
validated it, built it, and exited. `contents: write` was declared and never
used, so every run was discarded and `main` never moved — three scheduled runs
reported success that way while `content/` sat a commit behind a retraction. The
job has never deployed anything, despite an earlier version of this page saying
it did.

**It fails loudly.** Three separate conditions stop the run:

- The lock does not name the upstream commit that was checked out. A real sync
  always rewrites the lock to the commit it installed from, so any other value
  means the install did not come from upstream, whatever the exit code said.
- The pin was behind the canonical head and yet nothing changed. Commits between
  the two did not reach `content/`.
- A manual or webhook-triggered run produced no change at all. Those fire
  because something was expected to move. Only an idle daily cron over an
  unchanged upstream is allowed to be a no-op, and it says so in the log.

Structural gates — `content:check` and the build — run **before** the pull
request is opened, so a broken upstream never becomes a proposal. The currency
gate runs **after** it, on purpose: whether review dates have expired is a fact
about the content, not about the sync, and refusing to install overdue
curriculum is exactly what leaves this copy asserting dates upstream has already
withdrawn. It still fails the job, every day it is true.

---

## Local / CLI Synchronization

`content:sync` reads a `project42-content` checkout beside this repository, or
one named with `--source`. It refuses to lock a checkout with uncommitted
changes, because a lock naming a commit while holding uncommitted bytes is a
lock that lies.

```bash
npm run content:sync                       # sibling checkout
npm run content:sync -- --source ../elsewhere
npm run content:check                      # verify against the lock, offline
npm test
npm run build
```

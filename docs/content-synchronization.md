# Universal Content Synchronization Guide

Project 42 Platform supports three independent vectors for keeping curriculum up to date:

```text
                ┌─────────────────────────────────┐
                │ 1. Scheduled Daily Check        │
                │    (Daily 00:00 UTC)     │
                └────────────────┬────────────────┘
                                 │
┌────────────────────────┐       │       ┌────────────────────────┐
│ 2. Manual Operator     │───────┼───────│ 3. Orchard Event Push  │
│    Workflow Dispatch   │       │       │    (Webhook Dispatch)  │
└────────────────────────┘       │       └────────────────────────┘
                                 │
                                 ▼
                ┌─────────────────────────────────┐
                │ Content Sync & Validation│
                │  • Pulls project42-content      │
                │  • Records the upstream commit  │
                │  • Validates schemas & quizzes  │
                │  • Builds platform package  │
                │  • Does not publish or deploy │
                │  • Reports validation results     │
                └─────────────────────────────────┘
```


## Publication boundary

Despite its historical name, the Content Sync & Deployment workflow validates
in a temporary runner workspace. It does not commit the synchronized result,
publish a platform release or deploy the public site. Its daily currency guard
detects divergence from upstream. A green synchronization run is not evidence
that the deployed portal has adopted that revision.

Publication requires a reviewed synchronization commit, platform release,
consumer dependency update, site validation and deployment. Adopters follow the
same explicit build/release boundary for their own content overlays.

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

### Vector 1: Scheduled Daily Check
Runs daily at midnight UTC (`0 0 * * *`) in GitHub Actions (`.github/workflows/content-sync.yml`).

### Vector 2: Manual UI Trigger
Operators can trigger a runner-local content pull and build by clicking **Run workflow** under the **Content Sync & Deployment** tab in GitHub Actions.

### Vector 3: Event-Driven Upstream Webhook
When the upstream maintenance system finishes an authoring run, it dispatches a
repository event (`content_updated`) to trigger runner-local synchronization and validation. This is the handoff point: that system's responsibility ends when it
has dropped content into `project42-content` and fired this event. Everything
after the event is this repository's job.

That maintenance system is operated by the project owner and is not part of the
open-source product. For what it does, where material is sourced from, and who
approves it before it reaches a learner, see
[how the curriculum stays current](how-content-stays-current.md).

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

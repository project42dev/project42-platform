# The definition of done

Six criteria decide whether Project 42 is finished. They are the project
owner's own words, and they are the only test that matters. Everything else in
`docs/` describes how the product is built; this page describes when it is
working.

1. The pipeline is green.
2. The site is deployed.
3. A learner can log in.
4. A learner can take a class.
5. The learner's data persists.
6. The themes are correct, and one config field switches the theme.

They are deliberately about a **running deployment**, not a repository. A
criterion is met when it has been *observed* in production. It is not met
because a config file names the right value, because a workflow exists, or
because a previous session said so.

> **Why this page exists.** Until 2026-09-10 these six criteria lived only in
> conversation. Work was repeatedly declared finished against a remembered
> standard that no file stated, and more than once a criterion was reported met
> on evidence that could not have proved it. The criteria are now
> version-controlled. If they change, they change here, in a commit.

## How to read the criteria

Each criterion below has four parts.

**What it means** — the concrete claim, narrow enough to argue about.

**What observation proves it** — the specific thing you must see in the running
system. Every one of these is an observation of behaviour, not of
configuration.

**What does not prove it** — the evidence that has previously been mistaken for
proof. This section is the reason the page is worth keeping. Each entry is a
mistake actually made on this project, not a hypothetical.

**Status** — what was and was not observed on the status date, stated honestly
including the failures.

The status blocks are a snapshot. The live backlog that tracks each failure
back to green is the owner's private operational backlog,
`project42dev-ops/pmo/plans/operational-readiness-tasks.md`. That file holds the
task list, the owners and the blockers; this file holds the standard those tasks
are working toward. This page defines done; that file tracks the distance to it.
Task **T-19** in that backlog is the task this page discharges, and **T-21**
requires the backlog to be updated in the same session any criterion changes
state.

---

## 1. The pipeline is green

**What it means.** Every workflow that gates a release or a deployment passes on
`main`, in every repository that ships part of the product. Not one repository.
Not one workflow. Not "green except for the known failure".

The repositories and the gating workflows are:

| Repository | Gating workflows |
|---|---|
| `project42-platform` | `ci.yml` (CI), `release.yml` (Signed release), `release-oci.yml` (Release Multi-Arch OCI Image) |
| `project-42.dev` (the portal) | `ci.yml`, `deploy-pages.yml` |
| `project42-gallery` | `deploy.yml` |
| `admin.project-42.dev` | `deploy-pages.yml` |

`content-sync.yml`, `ado-sync.yml` and `dated-deferrals.yml` are not release
gates, but a failure in them is still a failure — `dated-deferrals.yml` in
particular is designed to turn red on a date and must be answered, not waived.

**What observation proves it.** The most recent run of each gating workflow on
`main` in each repository has `conclusion: success`, checked at the same time,
and each run's `headSha` is the current `main`. Read them from the API rather
than from a badge:

```sh
gh run list --branch main --limit 10 \
  --json workflowName,conclusion,headSha,createdAt
```

**What does not prove it.**

- A green run in one repository. The product ships from four.
- A green run on a release tag while `main` is red, or the reverse.
- A green run whose `headSha` is behind `main`. That run tested different code.
- A run that succeeded because a job was **skipped**. A skipped job is an
  untested job, and jobs here skip silently when their credentials are absent.
- A green pipeline on a release that was cut with the gates bypassed. If the
  release process can be forced past a red gate, a green tag proves nothing
  about the code inside it.

**Status, 2026-09-10 — FAILS.**

`project42-platform` `CI` on `main` is red on its two most recent runs, run IDs
`34495740232` (2026-09-10T15:27Z, head `5e4112a`) and `34438602370`
(2026-09-10T04:48Z). Two jobs fail: `verify` at the step "Run npm run check",
and `secure-self-host-smoke` at "Scan every secure-topology image". A third,
`hosted-identity-smoke`, is skipped. `Signed release` also failed on the
`v0.110.0` tag. The last green platform `CI` on `main` was `34143531765` on
2026-09-07.

The portal's `ci.yml` and `deploy-pages.yml` were both green on their most
recent runs (2026-09-07T20:36Z, head `b137d45`).

This criterion was not among the failures previously recorded. It was found red
while this page was being written, which is the argument for writing the
observation down rather than carrying the belief.

---

## 2. The site is deployed

**What it means.** The public surfaces answer over HTTPS, and what they serve is
the current build of the current code — not a stale artifact that happens still
to be reachable.

The surfaces are the portal (`https://project-42.dev`, including the learning
routes), the admin site (`https://admin.project-42.dev`), and the learning
records API (`https://api.project-42.dev`).

**What observation proves it.**

- `GET https://project-42.dev/` returns 200 and renders the portal, and a
  learning route such as `/learn/` returns 200.
- `GET https://admin.project-42.dev/` returns 200.
- `GET https://api.project-42.dev/health` returns 200 with a body naming the
  live adapter and its contract version.
- The `headSha` of the most recent successful `deploy-pages.yml` run equals the
  current `main` of the portal, **and** the platform version that build pinned
  is the platform version whose behaviour you are claiming is live.

That last clause is the one usually skipped, and it is the one that catches the
common failure: a fix is merged and released in the platform, and the portal
never takes it.

**What does not prove it.**

- A 200 from the origin. A stale build returns 200 exactly as a current one
  does.
- A merged pull request. Merging is not deploying.
- A published platform release. The portal consumes the platform through an
  explicit pin in `package.json`; releasing does not move the pin, and moving
  the pin does not deploy the portal.
- A successful `app:materialise` in a working copy. The site verifies whatever
  copy is materialised at build time; re-run it after every pin bump or the
  build validates a stale tree.

**Status, 2026-09-10 — PARTLY OBSERVED.**

Observed: portal 200, `/learn/` 200, admin 200, and
`api.project-42.dev/health` 200 reporting adapter `cloudflare-d1` at contract
version `1.1`.

Also observed, and it matters: the deployed portal build is `b137d45`, the head
of the portal's `main`, and that build pins `@project42/platform` at
**`v0.109.0`**. The platform has since tagged **`v0.110.0`**, which contains the
progress-persistence fixes relevant to criterion 5. (That tag's OCI image
published; its `Signed release` workflow failed — see criterion 1. The portal
consumes the git tag, so the tag is available to pin regardless.) **Those fixes
are released but not deployed.** The site is up; the site is not current.

---

## 3. A learner can log in

**What it means.** A person with an approved account completes the identity flow
in a browser and lands in the portal holding a session the API accepts — not
merely a session the browser holds.

**What observation proves it.** A real sign-in, performed by a human in a
browser against production, after which an authenticated request made by that
session — `GET /v1/me/progress` is the natural one — returns **200**. The
sign-in and the authorised call are one observation, not two.

**What does not prove it.**

- The OIDC redirect chain completing. Every step of the redirect can be correct
  and the resulting session still be rejected by the API. This exact mistake
  stood as "sign-in verified" from 2026-09-04 until a real module completion
  was attempted on 2026-09-09.
- `GET /v1/me/progress` returning **401 `missing_access_token`** when
  unauthenticated. That proves the endpoint is alive and the guard works. It
  says nothing about whether anyone can get past the guard.
- The identity provider's own sign-in success page.
- An `account_state` of `approved` in the database. Approval is a precondition,
  not an outcome.
- A timestamp moving on a row in the user table. It shows an identity was
  touched; it does not show a usable session was issued, and where one human
  holds several identity rows it does not even show *which* identity the
  session resolved to.

**Status, 2026-09-10 — NOT OBSERVED TODAY.**

Observed: `GET /v1/me/progress` unauthenticated returns 401
`missing_access_token`, so the endpoint and its guard are live. No authenticated
production sign-in was performed for this record. A direct read of the user
table to check recent sign-in activity was blocked by policy and was not
retried.

---

## 4. A learner can take a class

**What it means.** A signed-in learner opens a module, works through it, and
reaches a conclusion the product recognises. On this product a module counts as
taken when its knowledge check is answered and the result is recorded — that is
the completion event, not scrolling to the bottom of the page.

The module must also be a real module. A page that renders template scaffolding
where the prose should be is reachable, not teachable.

**What observation proves it.** In production, signed in: open a module, play
the instructor content, answer the knowledge check, and see the product
acknowledge the result within that session — the module shows as complete and
the path's progress advances.

**What does not prove it.**

- The module route returning 200. Reachable is not teachable; modules have been
  reachable in production with no prose in them.
- A passing browser test against a local build. The class must be takeable on
  the deployed site.
- A completion visible only because the page has not been reloaded. In-session
  acknowledgement is all criterion 4 claims — durability is criterion 5, and the
  two must be observed separately or a purely local optimistic update will
  satisfy both by accident.

**Status, 2026-09-10 — NOT OBSERVED TODAY.** A module was taken in production on
2026-09-09 and the in-session behaviour was not the reported failure; the
failure was persistence. See criterion 5.

---

## 5. The learner's data persists

**What it means.** What a learner does survives the session, the browser and the
device. Completing a module writes a durable record on the server, and a later
sign-in — new session, different machine — shows it.

**What observation proves it.** Both halves, in this order:

1. A real signed-in module completion in production produces a row in
   `module_progress` in the production learning-records database, **queried
   directly**, carrying today's timestamp.
2. A **fresh** session — sign out, sign in again, ideally on another device —
   renders that completion on the My Learning page.

Both are required. The first without the second means the data is stored but
unreachable; the second without the first can be satisfied by client-side state
that will not survive a cache clear.

**What does not prove it.**

- A write call returning 200. The response says the request was accepted, not
  that a row exists. Query the table.
- Row counts matching after a database migration. That proves the migration
  copied what it was given. It says nothing about whether the running
  application writes anything new.
- Progress rendering on the page you are already on. The client can be showing
  optimistic state.
- Rows existing in the table. Check their timestamps and their source. This
  database held exactly one progress row that looked like proof of persistence
  and was in fact a one-off import of browser local storage from months
  earlier, carrying `source: browser-local-v1`.
- A green sign-in check. Sign-in and persistence are different claims, and the
  defect that broke this criterion lived on the WRITE path, in two stacked
  layers. The app PUTs `/v1/me/progress` stamped `account-backed-v1`; the
  worker's allow-list named only `browser-local-v1` and
  `project42-portable-json`, so every routine save was refused with a 400
  (fixed in 02f18f7, v0.110.0). Widening that allow-list then exposed the layer
  beneath it: `progress_imports` carries a CHECK constraint listing the same
  two sources, and its INSERT shares a D1 batch with `module_progress`, so the
  whole batch aborts and the 400 becomes a silent 500 (migration 0020). A
  failed hydration read *also* disables writes for the session, but that is
  resilience hardening, not this root cause — had hydration succeeded, every
  write would still have failed. A regression gate built from the read-path
  description would test hydration retry and miss both real faults.

**Status, 2026-09-10 — FAILS.** This is the known failure, and it is still
failing.

Queried directly against the production learning-records database on
2026-09-10: `module_progress` holds **0 rows**. `learning_progress` holds 1 row
and `learning_events` 1 row, both dated **2026-07-30**, and both are the
imported browser-local-storage record described above. A module taken on
2026-09-09 produced no row of any kind.

Fixes for the hydration gate shipped in platform `v0.110.0`. As recorded under
criterion 2, the deployed portal still pins `v0.109.0`, so **the fix is not in
production and this criterion cannot yet be re-tested**. Deploying it is a
precondition for observing the criterion, not evidence of it: the observation
above must be re-run afterwards and must come back with a row.

The regression gate that would stop this criterion failing silently again does
not yet exist. It is tracked in the private operational backlog.

---

## 6. The themes are correct, and one config field switches the theme

Two claims. Both must hold.

### 6a. The themes are correct

**What it means.** The deployed site renders the theme it is configured to
render, completely — every appearance value comes from the theme rather than
from hardcoded values in core — and the rendered result satisfies the
accessibility floor for every theme the deployment offers, not only the one
currently selected. The ownership model is in
[appearance-contract.md](appearance-contract.md).

**What observation proves it.**

- The served HTML's `data-theme` attribute equals the `theme` field in the
  deployment's `project42.config.json`, and the stylesheets it loads are that
  theme's bundle.
- The contrast and appearance gates pass against the **rendered** site, over
  every theme in `availableThemes`, including in forced-colors mode.
- The theme bundle being served is the pinned version, not a stale materialised
  copy.

**What does not prove it.**

- The config file naming the theme. That is the input, not the output; a
  resolver has installed the wrong bundle with every gate green.
- The site looking right in one theme. Alternatives ship with the product and a
  deployer may select any of them.
- A hand-picked list of colour pairs passing a contrast check. A curated pair
  list encodes a judgement the theme does not get to make; enumerate the pairs
  the theme actually produces.
- A theme bundle existing. Several bundles have been present and effectively
  empty.

**Status, 2026-09-10 — OBSERVED (this half).** The served portal HTML carries
`data-theme="portal-default"` and `data-layout="standard"`, loading
`/themes/portal-default/tokens.css` and `/themes/portal-default/portal.css`.
The portal's `project42.config.json` sets `"theme": "portal-default"`. Served
output matches configured input.

### 6b. One config field switches the theme

**What it means.** Changing the single `theme` field in
`project42.config.json` to another value — a bundle dropped into the site
repository, or one taken from the Gallery — changes the site's entire
appearance. No code change, no build-script change, no manifest, no lock file,
and no network call required for the site to have a look at all.

**What observation proves it.** A round trip against production: change the
field to another `availableThemes` value, deploy, observe the served HTML's
`data-theme` and stylesheet URLs change to match, then change it back and
observe the original restored. The observation is in the served output of the
deployed site.

**What does not prove it.**

- The switch working in a local development server.
- One direction only. Both ways, or it is not a switch.
- The theme selector in the browser changing the appearance. Theme is
  deployment-owned and layout is a browser preference; a client-side toggle is a
  different mechanism from the config field.
- The absence of a build error after editing the field.

**Status, 2026-09-10 — NOT RE-OBSERVED TODAY.** The round trip was proven
against production on 2026-09-07. It has not been re-run since, and no change
since then is known to affect it.

---

## Summary

| # | Criterion | Status 2026-09-10 |
|---|---|---|
| 1 | The pipeline is green | **FAILS** — platform `CI` red on `main`, two consecutive runs |
| 2 | The site is deployed | Partly — all surfaces 200, but the deployed build is a platform version behind |
| 3 | A learner can log in | Not observed today — endpoint and guard live, no authenticated sign-in performed |
| 4 | A learner can take a class | Not observed today |
| 5 | The learner's data persists | **FAILS** — `module_progress` holds 0 rows; fix released, not deployed |
| 6a | The themes are correct | Observed — served `data-theme` matches config |
| 6b | One config field switches the theme | Not re-observed today — last proven 2026-09-07 |

Two fail outright, one is a platform version behind, and three have not been
observed today. None of that is a reason to soften the criteria.

## Changing this page

The six criteria are the owner's. Do not add, remove or reword one here; if they
change, the owner changes them and this page records the new wording.

The *observations* are ours to improve, and should be. When an observation turns
out to be weaker than it looked — when something treated as proof turns out not
to have been — move it into the "what does not prove it" list rather than
deleting it. That list is the accumulated record of how this project has fooled
itself, and it is the most useful part of this page.

Update the status blocks when a criterion changes state, and update the
operational backlog in the same session.

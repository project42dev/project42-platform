# The Canonical Content Split

**Last verified:** 2026-09-10

Why curriculum is a separate repository rather than a directory in this one, and why the platform consumes it hash-locked at a named upstream commit instead of vendoring a copy. The public trail is lopsided: the three commits that carried the split out have empty message bodies, while the commits that *completed* it two weeks later argue their constraints in detail. The reasoning behind the split itself is recorded privately, and section 6 says exactly where and what it does and does not settle.

---

## 1. Context

`project42-content` was created on 2026-08-20 with a single commit, `9f42200`, "initial canonical curriculum extraction from platform". That commit has no message body. The 3-layer architecture document that names the repository "THE CANONICAL CONTENT REPO" arrived two days later in `e18be2d`, and the three-vector sync workflow in `ac20ace`. Both of those commits also have empty bodies.

So in the public repositories the shape was declared and the rationale was not. It exists — see section 6 — in the private operations repository. What the architecture document asserts, and still asserts, is the property the split is for:

> **2. THE CANONICAL CONTENT REPO (project42-content)** — Raw, host-agnostic, schema-validated curriculum data. Versioned releases. Contains NO frontend code, build scripts, or hosting bias.

The extraction was **half done for two weeks**, and that is where the record becomes detailed. The platform's own copy was never removed and the tooling still built from it: the platform compiled its vendored curriculum into a generated catalogue and the portal read the result, so the canonical repository fed nothing and the maintenance system maintained a repository no one read (`b4e7467`, `8f14569`).

Three specific failures made that worse than a redundancy:

- **The two copies had drifted by a whole learning path and 100 KB of catalogue while both declared `contentVersion` 0.42.0**, so nothing could detect the divergence (`b4e7467`).
- **The pipeline was not missing, it was hollow.** `.github/workflows/content-sync.yml` implements all three designed vectors correctly, but its sync step called `scripts/sync-content.mjs`, which never contacted the content repository — it created an empty directory and re-ran the local generator. The step was written with a trailing `|| echo`, so it could not fail and printed success when it did (`b4e7467`).
- **The workflow never checked the content repository out at all**, so the sync could not have reached upstream even had the script tried (`b4e7467`).

## 2. Decision

1. **`project42-content` is the source of truth for curriculum.** It holds raw, host-agnostic, schema-validated data and no presentation, build or hosting code.
2. **The platform installs that curriculum; it does not author it.** `scripts/sync-content.mjs` installs the tree from a content checkout.
3. **The installed tree is hash-locked.** `config/content.lock.json` records the upstream commit, the `contentVersion`, and a hash of every file — 609 of them at the time of the change.
4. **`--check` re-verifies the installed tree with no network**, so an air-gapped build still works (architecture principle 5) while editing curriculum here instead of upstream fails the build. `content:check` joined `npm run check`.
5. **The lock refuses a dirty upstream checkout.** From `b4e7467`: *"a lock naming a commit while holding uncommitted bytes is a lock that lies."*
6. **Derived artifacts stay generated here, not locked.** Training coverage is written by the package generator from the training scripts, so locking it made the lock fail on its own generator: every curriculum change would have demanded a second upstream commit just to re-record what this repository had recomputed. It is preserved across the install and policed by the gate that owns it (`44523b1`).

## 3. Why hash-locked rather than a version pin

Three properties, each traceable:

| Property | Why it needed the hash rather than a version number |
|---|---|
| Drift is detectable | The two copies had already drifted while both declared the same `contentVersion`. A version number could not tell them apart; a per-file hash can. |
| Air-gapped builds still verify | `--check` re-verifies the installed tree with no network at all, which a pull-to-compare scheme cannot do (architecture principle 5). |
| Editing curriculum in the wrong repository fails | A hash of the installed tree makes a local edit to consumed content a build failure rather than a silent fork. |

## 4. Consequences

- **The platform stopped pinning the shape of the curriculum.** Three literals broke the moment the canonical catalogue was consumed: a substantive module count frozen at 69, an assertion that the first learning path has exactly 16 modules, and a validation error message naming a specific path as the first. All were derived instead, and the second was rewritten to assert what actually matters — that no learning path is empty (`b4e7467`, `44523b1`).
- **The sync workflow can now fail.** It checks the content repository out and no longer swallows its own error.
- **The connection immediately exposed content debt that had accumulated unmeasured.** 44 of 114 modules declared an instructor script with incomplete cues — 264 missing narration, visual, learner-prompt, checkpoint and assessment-handoff cues. `b4e7467` landed on a branch rather than main for this reason, and records the cause plainly: *"the curriculum grew for months with nothing validating it against the consumer contract it has to meet."* The unauthored scripts were subsequently dropped upstream (`afd56f8` in `project42-content`, 2026-09-05), along with 23 modules that were defined twice (`fdb5e6f`).
- **An adopter inherits the same split.** `project42-portal create` writes a content repository that inherits `project42-content` into `upstream/` — hash-locked — while local material lives in `custom/`, which no sync touches, and the two are layered by a catalogue merge (`d0b9e95`). That merge did not reach the rendered site until `01e164c`, which is recorded in [the front-end decision](front-end-in-the-platform.md).

## 5. Evidence

| Commit | Repository | Date | Subject |
|---|---|---|---|
| `9f42200` | project42-content | 2026-08-20 | feat(content): initial canonical curriculum extraction from platform AB#8002 — no message body |
| `e18be2d` | project42-platform | 2026-08-22 | docs: add 3-layer architecture, content sync guide, and universal hosting runbooks (AB#109) — no message body |
| `ac20ace` | project42-platform | 2026-08-22 | feat(sync): add 3-vector content sync workflow and ingestion summary engine (AB#109) — no message body |
| `b4e7467` | project42-platform | 2026-09-05 | feat(content): pull the curriculum from the canonical repo AB#6167 |
| `44523b1` | project42-platform | 2026-09-05 | fix(content): finish the sync and unpin two curriculum snapshots |
| `8f14569` | project42-platform | 2026-09-05 | Merge: platform consumes the canonical content repo AB#6167 |

Subjects are verbatim up to the em dash; the note after it is this record's.

State checked on 2026-09-10: `config/content.lock.json` records schema version 1, source `project42-content`, upstream commit `bb00b9a`, `contentVersion` 0.42.0, and a per-file hash map; `scripts/sync-content.mjs` and the `content:check` gate are both present and `content:check` is in `npm run check`.

**The lock is behind the content repository, and that is the mechanism working rather than failing.** On 2026-09-10 the content repository's `main` is at `55cce48`, two commits ahead of the locked `bb00b9a` — a currency correction that withdrew review dates that were never earned, and a test fix. A build from this revision therefore installs curriculum metadata that upstream has since retracted, and would serve it, until a sync runs. What the production deployment currently serves is not verified here — that needs the deployed build's own lock or a live probe, and this record has neither. A hash lock makes that visible in one command; a version pin would not have, because both sides can carry the same `contentVersion` while their bytes differ, which is exactly the failure section 1 describes. Whether the drift is intended at any given moment is an operational question this record does not answer.

## 6. What this record does not establish, and what is recorded elsewhere

**The reasoning for the split is recorded — privately, and not in any of the commits that carried it out.** Three private documents hold it, all in the operations repository where planning material lives by the deliberate decision described in [the docs index](../README.md):

- **ADR-0002, *Use One Structured Canonical Content Model*** (2026-07-23). The context it argues from is drift: overlapping material stored as Markdown, standalone HTML and JavaScript data, with counts and versions already diverging. Its decision is to store authored public content once, schema-validated and version-controlled, with rendered pages, indexes, feeds, search documents and exports as generated artifacts that are never separately hand-maintained. It compares git-authored structured content against a headless CMS. It settles the *model*.
- **ADR-0001, *Separate Private Operations, Hosted Site, and Open-Source Platform*** (2026-07-23). It settles the *repository boundaries* — and places canonical curriculum in the versioned platform package, which is the arrangement the August extraction later moved away from.
- **A dedicated plan for the content repository and the open-source platform**, archived, which sets out the decoupled three-tier separation of curriculum data from the platform engine and from the maintenance system, with the end-to-end map.

So the honest position is narrower than "the reasoning was never written down", and worth stating precisely: the *model* and the *tiering* were argued out in July; the *specific decision to make curriculum its own repository* — moving it out of the platform package where ADR-0001 had put it — is carried by the archived plan and by no commit message. The public record of it is this page.

Genuinely not established:

- **Why 2026-08-20, and on whose authority.** Nothing found dates or attributes the trigger for the extraction itself. Searched on 2026-09-10 across `project42-platform`, `project42-content`, and the private operations repository's `pmo/` and `docs/` trees.
- **Why the extraction stopped half-finished.** `8f14569` states plainly that it was only half done and that every maintenance pass in between landed in the wrong place. It does not say why the second half was omitted, and nothing else found does either.
- **Whether the adopter's inherited-content path has been exercised end to end by anyone other than its author.** `d0b9e95` and `01e164c` record it being proven on a generated site; no independent adoption is recorded here.

## Related

- [../content-synchronization.md](../content-synchronization.md) — the three sync vectors and the lock format
- [../architecture.md](../architecture.md) — the three layers, and principle 5 on air-gapped operation
- [../content-authoring.md](../content-authoring.md) — how curriculum is written upstream
- [orchard-boundary.md](orchard-boundary.md) — who drops content into the canonical repository, and where their job ends
- [front-end-in-the-platform.md](front-end-in-the-platform.md) — how an adopter's own content reaches their site

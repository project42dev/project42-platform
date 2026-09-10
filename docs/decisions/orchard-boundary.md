# The Orchard Boundary

**Last verified:** 2026-09-10

Why the content-maintenance system is a private, separately owned repository that is part of Project 42 but not part of the open-source product; why its *method* is documented publicly while its *implementation* is not; and where exactly its responsibility ends. This is the one decision on this page whose central sentence is not derivable from the code alone — section 7 says which part rests on the project owner's statement and which part is in the repository.

---

## 1. Context

Curriculum for Project 42 is discovered and kept current by an automated maintenance system, referred to as Orchard. It runs research passes, drafts and re-verifies material, and moves items through two human approval gates before anything reaches a learner.

Until 2026-09-06 this repository carried 22 files under `docs/orchard/` describing that system's internals: the lifecycle state machine, queue and gate mechanics, schemas, adapters, controllers, script paths, and run-by-run operational status. It also carried the system's internal decision records — numbered 0015 and 0017 through 0028 (`cef1e60`).

The problem stated in `cef1e60`: those internals *"had no business in a public repository that other people adopt"*. None of them governed this platform. An adopter reading them would be reading the operating manual of a system they do not run and cannot obtain.

## 2. Decision

1. **Orchard is a separate repository, privately owned by the project owner.** It is part of Project 42 and is not part of the open-source product.
2. **Its responsibility ends at the content drop plus the trigger.** It researches, drafts and drops validated JSON, Markdown and Mermaid into the content repository, and it fires a signal saying there is new content. Nothing past that point is its job.
3. **The method is public; the implementation is not.** This was the deciding move, and the reasoning is recorded verbatim in `cef1e60`:

   > Removing it entirely would have been the wrong correction. A learner or an adopter has a legitimate need to know how the material they are studying is discovered and kept current, and who approves it. That is provenance, and hiding it is not a boundary, it is opacity.

4. **The public account lives in [how the curriculum stays current](../how-content-stays-current.md).** It covers the two tracks in plain terms, the vetted source registry, the two human approval gates that stand between a model and a learner, how freshness is recorded and enforced by the build, where published material lands, and how to request or challenge content — and it ends with an explicit limits section: coverage is not exhaustive, a last-verified date means the source was checked on that date and nothing more, human approval is a floor rather than a warranty, and the parts that are designed but not built are each named.
5. **Nothing on that page is written in the present tense unless it was verified against this repository** (`cef1e60`). A neighbouring correction the same day made the trust page stop describing a multi-model role split as a running system, because it is a contract the schemas enforce on a proposal and two of its roles have no implementation (`28272b9`).

## 3. Where the boundary is, in code

The signal in decision 2 is not a description; it is a workflow trigger in this repository. `.github/workflows/content-sync.yml` accepts three vectors, verified on 2026-09-10:

| Vector | Trigger |
|---|---|
| 1 | Weekly cron, Sundays 00:00 UTC |
| 2 | Manual `workflow_dispatch` |
| 3 | `repository_dispatch`, type `content_updated` — the webhook the maintenance system fires when an authoring run finishes |

Vector 3 is the trigger half of "the drop plus the trigger". The drop half is the content repository itself, which is the subject of [the canonical content split](canonical-content.md).

**The trigger was declared long before anything sent it.** Checked on 2026-09-10: the sender is `orchard/scripts/lib/content-updated.mjs` in the maintenance system's own repository, added on 2026-09-06 by a commit whose subject is *"send the content_updated trigger nothing had ever sent"*, and called from its publication script. Its own header records that a search across that repository's scripts, libraries and workflows on 2026-09-06 found no `repository_dispatch`, no dispatch API call, and not one occurrence of the string — and that the content repository has no workflow directory at all, so it could not send it either. The stated consequence of the gap is the one this project keeps rediscovering: an approved correction merged, and then nothing happened until the Sunday cron noticed.

What that means for this record: between 2026-08-22, when the listener was declared, and 2026-09-06, the trigger half of the boundary existed as configuration and not as behaviour. Whether a dispatch has actually been delivered since is not established here — this page verified the listener and the sender in source, not a delivered event.

The downstream consequence of the boundary is that the platform's consumption of content is entirely pull-shaped: it checks the content repository out, installs a hash-locked tree, and can fail. It has no upward dependency on the maintenance system. Searched on 2026-09-10 across this repository's `scripts/`, `src/`, `bin/`, `web/`, `tests/` and `.github/`, the only references to the maintenance system by name are a lifecycle diagram rendered for readers, the documentation audit's list of sibling repositories, and the sync workflow's comment on vector 3. No code path here calls into it.

## 4. The boundary as decided, and the boundary as practiced

The two diverged, and the divergence is in this repository's own history rather than in anyone's account of it.

Between 2026-08-19 and 2026-08-22, **81 publication merges landed in `project42-platform`** — pull requests on branches named `orchard/publication/track-1/…` and `orchard/publication/track-2/…`, plus a run of `[Orchard] Release vN` merges. Under decision 2 those items should have landed in the content repository. They landed in the product repository instead, for weeks, while the architecture document already said the drop goes to the content repository.

Both halves were corrected on 2026-09-06 in the maintenance system's own repository: one commit repoints publication at the content repository and another repoints the 173 historical items that had already been published to the wrong target. Those commits are cited here as existing; their contents are internals and stay there.

The lesson worth carrying, and the reason this section is in a decision record rather than a changelog: **a boundary written into an architecture document and not enforced by anything is a boundary that drifts silently.** Section 7 notes that nothing in this repository fails a build if it drifts again.

## 5. Consequences

| Consequence | Where it shows |
|---|---|
| The internals moved out and inbound references were rewritten rather than deleted | the docs index, the architecture overview, the sync guide, the repository boundary, the legal and transparency requirements and the quality plan now point at the interface page, or, where they were quoting internals, no longer say it (`cef1e60`) |
| Cross-repository citations must be qualified, because unqualified paths silently resolved to the wrong repository | `e49aabb` — the convention note added the day before made four correct platform-relative citations wrong, and the docs audit now flags a backticked path on such a page that resolves only here |
| A reader who wants provenance gets the method, not the machine | [../how-content-stays-current.md](../how-content-stays-current.md) |
| The architecture overview states the boundary as principle 1 | [../architecture.md](../architecture.md) |
| The maintenance system's internal decision records live in its own repository | 0015 and 0017–0028, under `docs/adr/` there. They are cited here as existing, and deliberately not reproduced: quoting them back into this repository would undo the decision this page records. |

## 6. Evidence

| Commit | Repository | Date | Subject |
|---|---|---|---|
| `cef1e60` | project42-platform | 2026-09-06 | docs: publish the content-maintenance method, remove its internals AB#6167 |
| `a8408aa` | project42-platform | 2026-09-06 | docs: publish how the curriculum stays current, and stop documenting the maintenance system's internals AB#6167 |
| `e49aabb` | project42-platform | 2026-09-06 | docs: stop the Orchard path convention pointing at the wrong repo AB#6167 |
| `28272b9` | project42-platform | 2026-09-06 | docs: stop the trust page claiming a role split that does not fully exist AB#6167 |
| `d883073` | orchard (private) | 2026-09-06 | feat(publication): send the content_updated trigger nothing had ever sent AB#6167 |
| `197adb2` | orchard (private) | 2026-09-06 | fix(track-2): publish a currency finding where the content repository can read it AB#6167 |
| `269d0dc` | orchard (private) | 2026-09-06 | fix(publication): repoint the 173 historical items at the content repository AB#6167 |

Subjects are verbatim. The last three are named so the correction is auditable; their diffs are internals and are not reproduced here.

State checked on 2026-09-10: `docs/architecture.md` principle 1 states the drop boundary, the private ownership and the undocumented-internals rule; `.github/workflows/content-sync.yml` carries the `content_updated` dispatch type; there is no `docs/orchard/` tree in this repository; the private repository holds `orchard/docs/adr/0017-layer-separation.md` and the other records named above, and `orchard/scripts/lib/content-updated.mjs` with its publication-script caller.

## 7. What this record does not establish

- **The "responsibility ends at the drop plus the trigger" wording is the project owner's own statement**, given on 2026-09-05. The *substance* of it is corroborated here — principle 1 of [../architecture.md](../architecture.md) says the maintenance system is "strictly responsible for researching, drafting, and dropping validated JSON/Markdown content into the content repository", and vector 3 of the sync workflow is the trigger — but the boundary as a rule is not derivable from this repository's code alone. It is recorded here because it is the owner's decision and it matches what the code does, not because the code proves it.
- **Why the internals were public in the first place.** The commits record the correction, not the original choice. Searched on 2026-09-10 across this repository and the private operations repository's `pmo/` and `docs/` trees: nothing found decides to document them here. The likeliest reading is that they were never separately decided — a private set of records was moved wholesale into the public repository and the boundary question was not asked — but that is an inference, not evidence, and it is left as one.
- **The private records' own reasoning is not summarised here.** `orchard/docs/adr/0017-layer-separation.md` argues repository separation and one-way dependency direction between the maintenance system and the model layer. It does not, on its own, settle the open-source question or the drop boundary. The private operations repository holds the same numbered set — 0015 and 0017 through 0028 — alongside the earlier records that do settle the surrounding boundaries, notably ADR-0001 on repository and product boundaries and ADR-0004 on human-gated content automation. This page names them so a reader knows the reasoning exists and where; reproducing it would undo the decision the page records.
- **Whether the boundary is enforced by anything other than convention.** Nothing found in this repository fails a build if the maintenance system's internals reappear in `docs/`. The documentation audit checks links, paths, retired hosts, curriculum home claims and stale versions; it does not check for this.

## Related

- [../how-content-stays-current.md](../how-content-stays-current.md) — the public method, the gates, and its stated limits
- [../architecture.md](../architecture.md) — principle 1, the content-drop boundary
- [../content-synchronization.md](../content-synchronization.md) — the three sync vectors in detail
- [canonical-content.md](canonical-content.md) — what happens after the drop

# Three-Layer Theming

**Last verified:** 2026-09-10

Why appearance is owned in three places — a default bundle distributed with the product, a folder in the deployment's own repository that overrides it, and the Gallery as the source of alternatives — rather than in the Gallery alone or in core CSS. This decision was reversed once and reinstated, which is the most useful thing about it, so the reversal is recorded here rather than tidied away.

---

## 1. Context

Two problems ran together.

**Core CSS was painting things a theme is supposed to own.** Measured over `web/app/globals.css` there were 4,106 declarations — 2,667 structure, 1,338 appearance, 101 custom properties. Because appearance was pinned in core, it rendered the same whichever bundle was selected, and on a bundle of the opposite polarity it could be invisible: near-black text on a near-black panel, and `color: white` surviving in places no light theme could read (`03f4b31`).

**A deployment could not have a look without the Gallery.** Theme and layout bundles lived only in `project42-gallery`, arrived through a sync script, and were pinned by a hash lock that `npm run check` verified. A fresh scaffold therefore rendered unstyled until someone checked the Gallery out, and the look of a running site could change underneath its owner when a bundle was re-synced (`d913e97`).

The bar the project holds itself to is the static-site-generator standard, stated in `3f7c070` and again in `cce098f`: a fresh Hugo or Jekyll site has an appearance before anybody decides anything, and changing it is naming a different folder.

## 2. Decision

**Three owners, not two.**

| Layer | Owns | Rule |
|---|---|---|
| Core CSS | Structure. Consumes tokens, declares no brand. | `web/scripts/theme-boundary-check.mjs` fails the build on a colour literal, an accent used as text, a typeface named inline, a token pinned outside the fallback layer, or a new hardcoded radius or tracking value. |
| The bundle the product distributes | A complete default appearance, so an install has a look with no Gallery checkout, no sync step, no lock file and no network. | It is a floor, not a recommendation. |
| The Gallery | Alternatives. | Pulling from it stays supported and hash-locked; it is never a prerequisite for building. |

**A theme is a folder, and choosing one is naming it** in the single `"theme"` key of `project42.config.json`. Resolution has exactly three rules, implemented in `bin/project42-portal.mjs` (`resolveBundle`) and verified there on 2026-09-10:

1. `themes/<id>/` in the deployment's own repository — you downloaded a folder, dropped it in, named it. No sync, no lock entry, no manifest, no code change.
2. `public/themes/<id>/` already installed and either git-tracked or recorded in the deployment's theme lock — a site that vendors its Gallery-synced bundles keeps working as before.
3. The bundle the platform provides.

Naming a theme that nothing provides fails the install, naming the folder to create and the bundles available, rather than serving an unstyled page.

**The default bundle is generic, not one operator's livery.** `web/themes/portal-default/` is a white page, hairline rules, one slate-blue action colour, system type, no ornament. It is a complete bundle rather than a placeholder: all 48 tokens core reads, every component treatment the portal renders, the heading ramp bound to the layout's track tokens, and the four surfaces core stopped painting. Every foreground/background pair it declares is at or above 4.5:1 (`3f7c070`).

**Layout bundles are a separate contract** — composition, not brand — selected independently by bundle id. `web/layouts/` holds `standard`, `compact` and `wide`.

## 3. The reversal, and why it is recorded

The three-layer model was not reached in one step. The history is a genuine oscillation and the argument on both sides is preserved because it will be re-opened.

| Step | Change | The argument made at the time |
|---|---|---|
| `d913e97` | The product begins distributing a complete appearance of its own. | A site could not have a look without the Gallery; a re-sync could change an owner's brand underneath them. |
| `3f7c070` | The distributed default becomes generic `portal-default` instead of the Gallery's `06-galactic-guide`. | *"A Gallery theme is a choice; it cannot also be what you get when you have not chosen."* Otherwise every fresh install renders in one operator's livery. |
| `b78b82b` | The platform distributes **no** theme at all. `web/themes/` deleted; `--theme` made mandatory; resolution cut to two rules. | *"A static-site generator ships no theme — you pull one."* Bundling any theme makes every install wear whichever look it happened to bundle. |
| `cce098f` | Reverted. The product carries its theme again. | *"A deployment of Project 42 is what carries the default appearance … 0.108.0 removed the shipped bundles and required every site to supply a theme before it could install, which left a fresh deployment with no appearance at all."* |

The two positions differ on what the Hugo/Jekyll analogy actually says. `b78b82b` read it as *the generator carries no theme*; `cce098f` read it as *a fresh site renders something*. The reinstated position is the second, and the deciding fact was operational rather than theoretical: the strict reading made a fresh deployment fail `npm install` before it could render anything.

The downstream deployment did take the strict release, and the cost of it is visible in its history. `5c021fa` moved its platform pin to the theme-less release **and** added a local `themes/portal-default/` in the same commit, because otherwise the deployment would have failed to install. `8608521`, the same day, moved the pin on again to the reverting release, and `b137d45` then removed that local folder — because a theme folder in the deployment is resolution rule 1 and therefore **shadowed** the product's copy of the same id. The two were byte-identical at the time, so nothing rendered differently; the hazard was that any later change the product made to that bundle would silently never have reached the site. Whether the theme-less pin was ever deployed to production, as opposed to merely committed, is not established here.

## 4. What moved out of core, and why the split is where it is

`03f4b31` moved 104 appearance declarations out of core into tokens:

- 27 places where an accent or brand fill was read as **text**
- 31 typefaces named inline
- 28 pill radii
- 9 letter-spacing values that are steps of the published layout ramp
- 9 places painting `white` directly

The substantive pair is `--p42-text-accent` and `--p42-text-emphasis`. The reasoning, from `03f4b31`: *"An accent is a FILL colour; read as body copy it can fail contrast while passing its own contract."* Splitting the two decisions lets a bundle make emphasis text legible in its palette without touching a single fill. Both default to the fill already in use, so nothing moved visually — verified by capturing 121,231 computed style values across 15 routes from a real build before and after, which differed in one place, an in-flight transition opacity sampled microseconds apart.

`a4a4fbb` then made the distributed default declare the seven tokens core had surrendered, because a token nobody declares resolves to nothing.

`web/scripts/appearance-debt.json` is a **ratchet, not an amnesty**: 102 hardcoded radius and tracking values, 38 distinct, remain in core and the gate fails on a new value or a higher count. They were left rather than guessed at, because none matches a step in any published layout ramp, so collapsing them would change the rendered page — a decision for whoever owns the appearance.

## 5. Consequences

- A fresh install renders an intentional look offline. This is the property `b78b82b` removed and `cce098f` restored.
- A deployment that drops a theme folder in shadows the product's bundle of the same id, and stops receiving upstream changes to it. That is correct for a theme you own and a trap for one you merely copied — which is why `b137d45` removed such a copy once it was no longer needed, and why the appearance contract carries a standing instruction never to edit a theme you consume.
- The Gallery lock became what it always described: a record of what a deployment chose to pull. An absent lock is a site that never went there, not a broken site, so the theme check passes without one (`d913e97`).
- Two releases were spent moving between positions 2 and 3 of the table above. The reversal is the reason this record exists.
- A resolution bug shipped green through every gate: `materialise` read `availableThemes` — the switcher's menu — and not `theme`, the thing the site renders. A deployment offering the six Gallery bundles while rendering the product default installed six bundles and not the one it had selected, then rendered on fallback values with all gates passing. Fixed with two tests in `3f7c070`.

## 6. Evidence

| Commit | Date | Subject |
|---|---|---|
| `03f4b31` | 2026-09-06 | refactor(web): take the brand out of core CSS AB#6167 |
| `d913e97` | 2026-09-06 | feat(web): ship the appearance with the product AB#6167 |
| `a4a4fbb` | 2026-09-06 | feat(web): let the bundle own the seven tokens core surrendered AB#6167 |
| `85d8698` | 2026-09-06 | docs(architecture): write down who owns the look AB#6167 |
| `3f7c070` | 2026-09-06 | feat(themes): ship a generic default theme instead of a Gallery one AB#6167 |
| `b78b82b` | 2026-09-07 | feat(themes)!: ship no theme in the platform AB#6167 |
| `cce098f` | 2026-09-07 | revert(themes)!: the product ships its theme again AB#6167 |
| `5c021fa` | 2026-09-07 | feat(portal): own the theme this site renders AB#6167 (`project-42.dev`) |
| `8608521` | 2026-09-07 | chore(platform): take v0.109.0 AB#6167 (`project-42.dev`) |
| `b137d45` | 2026-09-07 | chore(portal): drop the vendored copy of the shipped theme AB#6167 (`project-42.dev`) |

Subjects are verbatim; the `!` marks the breaking change.

State checked on 2026-09-10: `web/themes/` holds `portal-default` and `06-galactic-guide`; `web/layouts/` holds `compact`, `standard` and `wide`; `resolveBundle` in `bin/project42-portal.mjs` implements the three rules in the order given above and fails with the folder-to-create message when none matches.

`3f7c070` was verified by building a real site both ways and reading computed styles from four routes, all 200: changing the one `"theme"` field moves the page ground, the body and heading typefaces, every heading colour, the primary action fill and shape, the eyebrow treatment and the card surface — and changing it back restores the previous rendering exactly.

## 7. What this record does not establish, and what is recorded elsewhere

**The "product carries built-in themes" position predates the September oscillation and has a private record behind it.** ADR-0012, *Permanent Six-Theme System and Hugo/Jekyll-Style Theme Generator Contract*, promotes the six evaluated visual directions to permanent built-in seed themes distributed with both the hosted platform and the self-host containers, standardises the vocabulary from "brands" to "themes", and defines the theme bundle as an isolated declarative folder. It is held in the private operations repository. Two things follow from its existence, both worth knowing before this argument is re-opened:

- The step recorded as `b78b82b` — distributing no theme at all — departed from a previously accepted position, not merely from habit. Nothing found says the revert was made *because* of ADR-0012, and this page does not claim it was; the sequence is recorded, the causation is not.
- The folder-shaped, one-config-field model in section 2 is not an invention of the September work. It was the contract before the code implemented it.

Genuinely not established:

- **Why the model had to be written down at all before it stabilised.** `85d8698` states the rule *"has been restated for weeks and was written down nowhere, so core kept reacquiring appearance"*. Where it was restated — conversation, review comments, chat — is not in the repository, so the earlier iterations of the argument are not recoverable here.
- **Whether the three areas deliberately not theme-owned were debated.** [The appearance contract](../appearance-contract.md) names them; no record was found of the alternative being considered.
- **The Gallery's side of the contract.** `a4a4fbb` records that the Gallery's six bundles need the same seven declarations and that the change *"is recorded for the Gallery; it is not made here"*. Whether and when the Gallery took it is not established from this repository.

## Related

- [../appearance-contract.md](../appearance-contract.md) — the full division of ownership: what core owns, what a theme owns, what a theme is guaranteed to be able to change
- [../architecture.md](../architecture.md) — principle 3, declarative Hugo/Jekyll-style theming
- [../self-hosting/portal-and-theming.md](../self-hosting/portal-and-theming.md) — how a deployer actually changes the look
- [front-end-in-the-platform.md](front-end-in-the-platform.md) — why the CSS is in the product at all

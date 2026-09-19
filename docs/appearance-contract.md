# The appearance contract

Who owns what a Project 42 site looks like, and what a deployer can change
without touching a line of the product.

The model is Hugo's and Jekyll's. The product ships a complete, intentional
look. Someone who wants a different one downloads a theme folder, drops it into
their own repository, and changes one field in `project42.config.json`. Nothing
in core needs editing. The bundle must include its manifest and assets.
Materialise it, regenerate brand assets and rebuild the site. Gallery sync
also records an installation lock; package installation needs network access
or staged dependencies.

## Three things, not two

**Core** — `web/app`, `web/lib`, `web/copy`, `web/worker`. Structure only.
Markup, routes, layout mechanics, behaviour, data, accessibility affordances.
Core owns no brand.

**The default theme** — the sole bundle `web/themes/portal-default/`, shipped inside
`@project42/platform`. This is the product's own appearance, and it is what a
fresh install renders. It exists so a site is never unstyled and never depends
on a service being reachable to have a look at all.

**Gallery themes** — published at `gallery.project-42.dev`. Alternatives a
deployer opts into. Convenience, never a prerequisite.

## How a theme is chosen

A theme is a folder. Choosing one is naming it.

```jsonc
// project42.config.json
{ "theme": "house-style" }
```

```
your-site/
  themes/
    house-style/          <- you downloaded this and dropped it in
      theme.json
      tokens.css
      portal.css
      mark.svg
      hero.png
      badges/
```

`project42-portal materialise` (run for you by `postinstall`) resolves the
named theme, highest precedence first:

1. **`themes/<id>/` in your repository.** You put it there; it wins.
2. **`public/themes/<id>/` already installed, and either tracked by git or
   named in the site’s theme-bundles lock.** That is a bundle the site
   pulled from the Gallery, so the next install leaves it alone. The lock is
   what makes it stick: a new scaffold git-ignores `public/themes/`, so being
   tracked is not on its own a reliable signal.
3. **The bundle the platform ships.** Always present, so every install renders.

Naming a theme no folder provides fails the install and says which folder to
create and what the platform ships. It never serves an unstyled page.

`public/themes/` is the *result* of that decision — a build input, like `app/`.
Layout bundles resolve identically from `layouts/<id>/`.

The Gallery sync (`npm run themes:sync -- --source <checkout>`) still works and
still writes a hash lock. The lock records what a site chose to pull from the
Gallery. An absent lock is a site that never went there, not a broken site:
`themes:check` passes without one and verifies only the bundles actually locked.

## What a theme is guaranteed to be able to change

Appearance without changing content or layout, through two files:

- **`tokens.css`** — the palette, the typefaces, elevation, status colours,
  overlays. Declared on `:root[data-theme="<id>"]`.
- **`portal.css`** — component treatments core does not express as tokens.

The token vocabulary a bundle must declare is enforced by
`web/tests/token-completeness.test.mjs`: every `--p42-*` token core reads must be
declared by every installed theme, or that surface renders unstyled on that
theme. `web/tests/surface-isolation.test.mjs` enforces the other direction — the
admin console pins the whole vocabulary so no theme can reach it.

Composition — width, spacing rhythm, density, radii, the type ramp — belongs to
the **layout** bundle (`--p42-shell`, `--p42-space-*`, `--p42-radius-*`,
`--p42-step-*`, `--p42-track-*`), selected independently by
`layout.defaultPreset`.

## What core may still declare

Structure: layout, positioning, sizing driven by content, focus rings, tap
targets, motion and forced-colours affordances.

Appearance only **by reference**. Core writes `var(--p42-text-accent)`, never a
colour. The one exception is the `@layer p42-fallback` block at the top of
`web/app/globals.css`, where each token is given its last-resort value once, so
there is exactly one place to look. It is a cascade layer because unlayered
styles always beat layered ones regardless of load order — a bundle therefore
wins every token it defines, no matter when its stylesheet loads.

Three areas are deliberately not theme-owned, and say so in
`web/scripts/theme-boundary-check.mjs`:

- **Third-party brand identity** (`.provider-pill-*`). A theme must not repaint
  Anthropic's or Google's colour.
- **The admin console.** A support call is not the moment to discover the
  console is unreadable because someone picked a light theme.
- **Accessibility overrides** and the **diagram viewer's fixed canvas**.

## The gate

There are two, and they ask different questions. The boundary gate asks whether
**core** has stolen appearance from the bundle. The correctness gate asks
whether **the bundle** is a usable, accessible theme.

### The correctness gate — are the bundles we ship correct?

`node web/scripts/theme-correctness-check.mjs`, run by `npm run web:check` and
so by `npm run check`. It measures every bundle under `web/themes/` against the
full theme contract: the token vocabulary, the colour-literal boundary,
declared polarity, 4.5:1 text contrast (WCAG 2.2 SC 1.4.3) and 3:1 non-text
contrast for every border against the surface it actually borders (SC 1.4.11).
`npm run themes:contrast` prints every measured pair with its ratio.

It does not own those rules. project42-gallery does, in its
`docs/THEME_CORRECTNESS_SPEC.md`, and its `checkBundle()` is vendored verbatim
here under `web/scripts/vendor/project42-gallery/`, hash-locked against the
Gallery commit it came from. A second implementation would be a second
definition of "correct", free to drift; editing the vendored copy in place
fails the build, and moving to a newer Gallery contract is a deliberate step:

```bash
node web/scripts/theme-correctness-check.mjs --vendor ../project42-gallery
```

This gate exists because of a defect it would have caught. The Gallery's
validator scans `project42-gallery/themes/` and nothing else. `portal-default`
is not a Gallery theme — it lives here, because the product's own default
cannot be owned by the catalogue of alternatives — so the one bundle every
fresh install and production itself renders with was the one bundle nothing
measured. When the Gallery's seven themes were raised to 3:1 on 2026-09-11,
`portal-default` was missed, and it was serving eight borders below the floor,
the softest at 1.23:1. A rule only one repository enforces is a rule the other
repository's artefacts do not have.

### The boundary gate — has core stolen appearance?

`npm run theme:boundary` fails the build on five things:

| | Rule |
|---|---|
| 1 | a raw colour literal in a themeable declaration |
| 2 | an accent or brand token used as **text** |
| 3 | a typeface named inline |
| 4 | a `--p42-*` token pinned to a literal outside the fallback layer |
| 5 | a hardcoded radius or letter-spacing beyond the recorded baseline |

Rule 2 is the subtle one. An accent is a *fill* colour. Read as body copy it can
fail contrast while passing its own contract — that is how near-black text
landed on a near-black panel at 1.04:1 in production. `--p42-text-accent` and
`--p42-text-emphasis` are separate decisions from the fills they default to, so
a bundle can make emphasis text legible in its palette without repainting a
single surface.

Rule 5 is a ratchet against `web/scripts/appearance-debt.json`, not an amnesty.
The baseline is now **0**: core carries no hardcoded radius or letter-spacing
value outside the fallback layer, and the gate fails the build on a single new
one. The gate fails on a new value or a higher count, so the list can only
shrink — it can never grow back from here.

It shrank from 102 to 53 (T-18, first pass) by publishing the steps core was
already writing by hand. Nine values were the *whole* population of a step the
ramp simply did not have: the control-scale radii below `--p42-radius-small`
(`--p42-radius-4xs/3xs/2xs/xs`, 6/8/10/12px in Standard) and the loose end of
the tracking ramp (`--p42-track-wide-1..5`, 0.02/0.04/0.06/0.08/0.12em in
Standard) — `--p42-track-2..5` only ever went *tighter*, so every eyebrow,
kicker and uppercase table header in the product was a bare literal no bundle
could reach. Standard's values are exactly the literals they replaced, so the
default composition renders unchanged; Compact and Wide scale them in step
with the radius and tracking ramps they already publish.

The second pass (T-18, AB#6167) took the remaining 53 down to 0. One value
population — display h1s and oversized glyphs (3.2–7.3rem) carrying tracking
tighter than any published step — was, like the first pass, the whole
population of a step the ramp did not have, so it gained one:
`--p42-track-6` (−0.075em in Standard, −0.08em Compact, −0.07em Wide, matching
the existing ±0.005em layout offset and the ramp's step size). Everything else
was mapped to the *nearest* existing step; several sit exactly at the
midpoint between two steps (≤0.01em either way), which is read as "within
tolerance" and rounded toward zero (the smaller-magnitude step) rather than
treated as absent. A few sit further out and are noted below as visible but
accepted drift.

| Hardcoded value | Occurrences | Mapped to | Distance from step | Note |
|---|---|---|---|---|
| `border-radius: 0 var(--radius-small) var(--radius-small) 0` | 3 | *(no change)* | — | Already fully tokenised; `theme-boundary-check.mjs`'s geometry exemption only matched a lone `0`/`50%`, so a multi-corner shorthand built entirely from zero-and-token corners still tripped rule 5. Widened the exemption instead of touching the CSS. |
| `border-radius: 0.65rem` (10.4px) | 1 | `--p42-radius-2xs` (10px) | 0.4px | |
| `border-radius: 0.6rem` (9.6px) | 1 | `--p42-radius-2xs` (10px) | 0.4px | |
| `border-radius: 0.85rem` (13.6px) | 1 | `--p42-radius-small` (14px) | 0.4px | |
| `border-radius: 0.8rem` (12.8px) | 2 | `--p42-radius-xs` (12px) | 0.8px | |
| `border-radius: 16px` | 2 | `--p42-radius-small` (14px) | 2px | Between `xs` (12px, 4px away) and `small` (14px); `small` is nearer. No token added — only 2 occurrences of this exact literal, below the ≥3 bar. |
| `border-radius: calc(var(--radius) - 10px)` | 1 | `--p42-radius-small` | 0px in Standard (24−10=14=14) | Was already responsive to `--radius`; the media-query override of `--radius` at ≤760px (line ~4022) no longer applies here since this rule is a static token now, not a calc off `--radius`. |
| `border-radius: calc(var(--radius) - 8px)` | 1 | `--p42-radius-small` (14px) | 2px in Standard (24−8=16) | Same rationale as the stray `16px` above — it rendered the same value. |
| `letter-spacing: -0.025em` | 1 | `--p42-track-3` (−0.02em) | 0.005em | |
| `letter-spacing: -0.03em` | 2 | `--p42-track-4` (−0.035em) | 0.005em | |
| `letter-spacing: -0.04em` | 3 | `--p42-track-4` (−0.035em) | 0.005em | |
| `letter-spacing: -0.045em` | 7 | `--p42-track-4` (−0.035em) | 0.01em (tie with track-5, −0.055em) | Highest-frequency remainder; exact midpoint between track-4 and track-5. Rounded toward zero. 0.01em on a 2rem heading is ≈0.3px per letter-gap — not a visible regression. |
| `letter-spacing: -0.05em` | 5 | `--p42-track-5` (−0.055em) | 0.005em | |
| `letter-spacing: -0.06em` | 3 | `--p42-track-5` (−0.055em) | 0.005em | |
| `letter-spacing: -0.065em` | 1 | `--p42-track-5` (−0.055em) | 0.01em (tie with the new track-6, −0.075em) | Rounded toward zero. |
| `letter-spacing: -0.07em` | 1 | `--p42-track-6` (−0.075em, new) | 0.005em | |
| `letter-spacing: -0.075em` | 2 | `--p42-track-6` (−0.075em, new) | exact | |
| `letter-spacing: -0.08em` | 1 | `--p42-track-6` (−0.075em, new) | 0.005em | |
| `letter-spacing: -0.1em` | 1 | `--p42-track-6` (−0.075em, new) | 0.025em | Accepted drift, noted — the single occurrence is below the ≥3 bar to warrant its own step, and it already sat furthest from every prior step (0.045em from track-5). |
| `letter-spacing: 0.035em` | 1 | `--p42-track-wide-2` (0.04em) | 0.005em | |
| `letter-spacing: 0.045em` | 1 | `--p42-track-wide-2` (0.04em) | 0.005em | |
| `letter-spacing: 0.05em` | 3 | `--p42-track-wide-2` (0.04em) | 0.01em (tie with wide-3, 0.06em) | Rounded toward zero. |
| `letter-spacing: 0.07em` | 4 | `--p42-track-wide-3` (0.06em) | 0.01em (tie with wide-4, 0.08em) | Rounded toward zero. |
| `letter-spacing: 0.09em` | 1 | `--p42-track-wide-4` (0.08em) | 0.01em | |
| `letter-spacing: 0.1em` | 1 | `--p42-track-wide-4` (0.08em) | 0.02em (tie with wide-5, 0.12em) | Rounded toward zero. |
| `letter-spacing: 0.11em` | 1 | `--p42-track-wide-5` (0.12em) | 0.01em | |
| `letter-spacing: 0.14em` | 1 | `--p42-track-wide-5` (0.12em) | 0.02em | Accepted drift, noted. |
| `letter-spacing: 0.16em` | 1 | `--p42-track-wide-5` (0.12em) | 0.04em | Accepted drift, noted — the largest single gap in this pass; only 1 occurrence, below the ≥3 bar. |

The tie-break rule, stated once: when a value sits exactly equidistant between
two steps, it snaps to the step nearer zero (the smaller-magnitude tracking).
`--p42-track-6` is the one place this pass added a token, because unlike every
tie above, the affected population (hero `h1`s and oversized display glyphs,
`--p42-step-5`-sized text) had no step on *either* side within tolerance —
the same "whole population of a missing rung" condition the first pass used
to justify `--p42-radius-4xs..xs` and `--p42-track-wide-1..5`. It was added to
`web/layouts/composition-tokens.json` and all three layout bundles
(`compact`, `standard`, `wide`) together with `layout-tokens-check.mjs`'s
sorted-list requirement, and to the `p42-fallback` layer in
`web/app/globals.css` so a site on a layout bundle that predates it still
renders. **`project42-gallery` vendors these bundles and must re-sync**
(`npm run sync:platform-layouts --ref <platform-sha>`) to pick up the new
token; until it does, its own copies fall back to whatever it already
declares for the affected selectors, unaffected by this change since the
Gallery does not consume this file.

## Rules for a deployer

- **Never edit a theme you consume.** A theme is replaced, not patched. Editing
  one in place is what makes an upstream re-sync silently change your site.
- To change something a theme does not expose, publish your own theme folder.
- Your repository owns `project42.config.json`, `project42.copy.json`, `config/`,
  `public/brand/` and `themes/`. Everything else under `app/`, `lib/`, `copy/`,
  `worker/`, `scripts/` and `tests/` is product, rewritten on every install.

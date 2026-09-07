# The appearance contract

Who owns what a Project 42 site looks like, and what a deployer can change
without touching a line of the product.

The model is Hugo's and Jekyll's. The product ships a complete, intentional
look. Someone who wants a different one downloads a theme folder, drops it into
their own repository, and changes one field in `project42.config.json`. Nothing
else changes: not the code, not a build script, not a manifest, not a lock file,
and no network call to anywhere.

## Three things, not two

**Core** — `web/app`, `web/lib`, `web/copy`, `web/worker`. Structure only.
Markup, routes, layout mechanics, behaviour, data, accessibility affordances.
Core owns no brand.

**The default theme** — `web/themes/06-galactic-guide`, shipped inside
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
   named in `config/theme-bundles.lock.json`.** That is a bundle the site
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

Everything visual, through two files:

- **`tokens.css`** — the palette, the typefaces, elevation, status colours,
  overlays. Declared on `:root[data-theme="<id>"]`.
- **`portal.css`** — component treatments core does not express as tokens.

The token vocabulary a bundle must declare is enforced by
`tests/token-completeness.test.mjs`: every `--p42-*` token core reads must be
declared by every installed theme, or that surface renders unstyled on that
theme. `tests/surface-isolation.test.mjs` enforces the other direction — the
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
Core still carries 102 hardcoded radius and letter-spacing values, 38 distinct.
None matches a step in any published layout ramp, so collapsing them would
change the rendered page — a design decision for whoever owns the appearance,
not a mechanical one. The gate fails on a new value or a higher count, so the
list can only shrink.

## Rules for a deployer

- **Never edit a theme you consume.** A theme is replaced, not patched. Editing
  one in place is what makes an upstream re-sync silently change your site.
- To change something a theme does not expose, publish your own theme folder.
- Your repository owns `project42.config.json`, `project42.copy.json`, `config/`,
  `public/brand/` and `themes/`. Everything else under `app/`, `lib/`, `copy/`,
  `worker/`, `scripts/` and `tests/` is product, rewritten on every install.

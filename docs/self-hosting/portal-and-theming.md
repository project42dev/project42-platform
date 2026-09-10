# White-Label Portal Theming & Customization Guide

This runbook is for an operator running the Project 42 open-source web portal
under their own brand. It describes where a site's appearance actually comes
from, in the order the installer resolves it.

The short version: **a fresh install already has a look.** The platform ships
its own theme, so `npm install` on a scaffolded site produces a complete,
rendered portal with no Gallery checkout, no sync step, no lock file and no
network. Changing that look is a folder and one config field.

Throughout this runbook a path written `./like-this` is relative to **your**
front-end repository. An unprefixed path such as `web/themes/` is inside the
`@project42/platform` package.

---

## 1. Quick start configuration

A Project 42 front-end repository *is* its configuration. Scaffold one:

```bash
project42-portal create acme-learn \
  --org "Acme AI Academy" \
  --origin https://learn.acme.example
```

That writes a front-end repository and a content repository beside it, with
content inheritance already wired. The front-end repository's `postinstall`
runs `project42-portal materialise`, which installs the application, resolves
the appearance, and generates `./lib/themeBundles.generated.ts`.

### `project42.config.json`

This is the whole surface. The scaffolded file:

```json
{
  "$schema": "https://raw.githubusercontent.com/project42dev/project42-platform/main/schemas/portal-config.schema.json",
  "theme": "portal-default",
  "availableThemes": ["portal-default"],
  "galleryUrl": "https://gallery.project-42.dev",
  "layout": {
    "defaultPreset": "standard"
  },
  "portal": {
    "canonicalOrigin": "https://learn.acme.example",
    "adminOrigin": "https://admin.acme.example",
    "legacyOrigins": []
  },
  "organization": {
    "name": "Acme AI Academy",
    "tagline": "Evidence-based AI learning",
    "supportUrl": "https://helpdesk.acme.example"
  },
  "branding": {
    "wordmark": "/brand/wordmark.svg",
    "mark": "/brand/mark.svg",
    "markMono": "/brand/mark-mono.svg",
    "markReversed": "/brand/mark-reversed.svg",
    "social": "/brand/social.svg",
    "maskIcon": "/brand/mark-mono.svg"
  }
}
```

Four fields decide appearance:

| Field | Meaning |
|---|---|
| `theme` | The theme the site **renders**. Exactly one. |
| `availableThemes` | The set of bundles `materialise` installs and indexes into `./lib/themeBundles.generated.ts`, and the only list `themes:sync` fetches. |
| `layout.defaultPreset` | The layout bundle the site renders by default. |
| `layout.availablePresets` | Optional; extra layout bundles to install alongside it. |

`theme` does **not** have to appear in `availableThemes`. The materialiser
resolves the selected theme either way — an earlier version read only
`availableThemes` and left a site that installed the Gallery bundles but
rendered the platform default with no bundle for the theme it had actually
selected.

### Theme is deployment-owned; layout is a browser preference

Worth being blunt about, because `availableThemes` looks like a menu and is
not one. **The shipped front end has no theme switcher.** `web/app/layout.tsx`
stamps `data-theme` from `config.theme` on every render and its inline boot
script calls `localStorage.removeItem("project42.theme.v1")` — any stored
theme is actively cleared on every page load. A learner cannot change the
theme, and nothing in the application reads `availableThemes` at runtime; the
only consumers are the materialiser and `themes:sync`.

Layout is the opposite: the same boot script reads
`localStorage.getItem("project42.layout.v1")` and falls back to
`layout.defaultPreset`, so layout *is* a per-browser preference.

Installing more than one theme is therefore about what a site can switch
*between* across deployments, and about the Gallery preview — not about a
control in the portal.

---

## 2. Where appearance comes from

There are three places a theme bundle can live, and `project42-portal
materialise` tries them **in this order** for every id in `theme` +
`availableThemes`:

| Order | Origin | Where the folder is | Wins when |
|---|---|---|---|
| 1 | `repository` | `themes/<id>/theme.json` in your own site repository | The folder exists. Copied over `public/themes/<id>/` on every install. |
| 2 | `vendored` | `public/themes/<id>/theme.json`, already installed | It is git-tracked **or** recorded in `./config/theme-bundles.lock.json`. Left exactly as it is. |
| 3 | `platform` | `web/themes/<id>/` inside `@project42/platform` | Nothing above provided it. Copied over `public/themes/<id>/`. |

If none of the three provides the id, **the install fails** and names the folder
to create. A site never renders unstyled because a theme went missing.

The materialiser prints which rule fired for each id:

```
Appearance: themes house-style from repository; portal-default from platform; layouts standard from platform.
```

Read that as your receipt. If a bundle you expected to come from your own
`./themes/` folder is reported `from platform`, the folder is missing its
`theme.json` and the platform's copy silently took its place.

Layout bundles resolve by the identical three rules against `layouts/<id>/`,
`public/layouts/<id>/` and the platform's `web/layouts/`, with `layout.json` as
the manifest.

### 2.1 What the platform ships (the floor)

`@project42/platform` carries theme bundles in `web/themes/` and layout bundles
in `web/layouts/`. They exist so a deployment has an intentional appearance the
moment it is installed, the way a fresh Hugo or Jekyll site renders with the
generator's stock theme. This layer was briefly removed in v0.108.0 — every site
then had to supply a theme before it could install, which left a fresh
deployment with no appearance at all — and restored in v0.109.0.

The default is **`portal-default`**: a white page, hairline rules, one
slate-blue action colour, system type, no ornament. `project42-portal create`
selects it unless you pass `--theme`. It is deliberately not a Gallery theme —
a Gallery theme is a *choice*, and shipping one as the default made every new
deployment wear another operator's brand.

> **The package currently ships two theme bundles, not one.** Alongside
> `portal-default` it still carries `06-galactic-guide`, which is a Gallery
> theme and one specific operator's brand. It predates `portal-default`, was
> not removed when the generic default was introduced, and both the
> distribution tests and the installer's own error message now name it — a
> site that names an unprovided theme is told it may "name one the platform
> ships (06-galactic-guide, portal-default)".
>
> This sits awkwardly against the stated intent that a Gallery theme is a
> *choice* and should not be shipped as part of the product. Until it is
> resolved: `portal-default` is the default and the one to build on.
> Selecting `06-galactic-guide` from the package gives you a frozen copy that
> does not track the Gallery — take it from the Gallery under the lock (§2.3)
> if you actually want that theme.

### 2.2 Your own theme (the normal case for an adopter)

Dropping a folder into your site repository is the whole procedure:

```
themes/
  house-style/
    theme.json      <- required; this is what makes it a bundle
    tokens.css
    portal.css
    mark.svg
    hero.png
    badges/
```

```jsonc
// project42.config.json
"theme": "house-style",
"availableThemes": ["house-style"]
```

```bash
npm run app:materialise
```

No Gallery, no lock file, no sync script, no code change. Your folder outranks
anything the platform ships and anything previously vendored under the same id.
Ids must match `^[a-z0-9]+(-[a-z0-9]+)*$`.

### 2.3 The Gallery (alternatives, pinned by hash)

The Gallery is where you go for a **different** look, not for a look at all. It
publishes complete versioned bundles — manifest, tokens, component treatments,
mark, hero artwork, badges — and the portal installs them under a lock:

```bash
npm run themes:sync                                       # Gallery checked out beside the site repo
node scripts/sync-gallery-themes.mjs --source ../project42-gallery
```

`./config/theme-bundles.lock.json` records the Gallery commit, the selected theme
and layout, and a **SHA-256 per file** of every bundle installed. Text assets
(`.css`, `.json`, `.svg`) are normalised — BOM stripped, CRLF folded to LF —
before hashing, so a checkout on Windows locks the same digest as one on Linux.
Symlinks inside a bundle are rejected outright.

```bash
npm run themes:check    # verifies the INSTALLED bundles against the lock
```

Check mode never reads the Gallery — CI does not check it out. Two rules matter:

- **An absent lock is not a failure.** It means the site never went to the
  Gallery; its appearance resolves from its own `themes/` folder or from the
  bundles the platform ships. `themes:check` says so and exits 0.
- **A configured theme with no lock entry is a locally resolved theme**, and is
  reported as resolved outside the lock rather than treated as missing.

Two constraints to know before you rely on it:

- `themes:sync` installs the ids in **`availableThemes` only**. It does not read
  `theme`. A Gallery id named in `theme` but absent from `availableThemes` is
  never fetched.
- If `theme` names an id that *is* in the lock, `themes:check` fails with
  `Selected theme differs from theme lock` unless `lock.selectedTheme` matches.
  See §3.

Theme installation or editing happens in the Gallery first, then the portal's
sync. Never copy a theme's CSS into platform core, and never edit page content
to make a theme fit.

---

## 3. Switching the theme

Which commands you run depends on which layer the new theme comes from.

**To a theme in your own `themes/` folder, or one the platform ships:**

1. Set `theme` in `project42.config.json`.
2. `npm run app:materialise`.

That is the entire operation — one config field and the installer.

**To a Gallery bundle:**

1. Add the id to `availableThemes` (sync reads that list, not `theme`).
2. Set `theme` to it.
3. `npm run themes:sync` — installs the bundle and rewrites the lock, including
   `selectedTheme`. This needs a Gallery checkout; `themes:check` alone will not
   do it, and the lock's `selectedTheme` is what `themes:check` compares against.
4. `npm run app:materialise`.

**Re-run `app:materialise` after every platform version bump.** The bundle under
`public/themes/` is build output; a site that skips it verifies a stale copy.

Derived assets follow the selected bundle. The favicon and every browser-size
alias come from the bundle's authoritative mark, and the installed app's
`theme_color`, `background_color`, meta `theme-color` and Safari mask-icon
colour are read from the bundle's `--p42-bg` and `--p42-primary` tokens
(`web/lib/themeBrand.ts` in the package) rather than configured as unrelated organization assets.
Run `npm run brand:generate` after a theme change.

### `doctor`

```bash
npm run doctor
```

Reports what a front-end repository is missing, and resolves every id in
`availableThemes` across all three layers before calling a theme unprovided. It
deliberately does **not** require `./config/theme-bundles.lock.json` — a site
whose appearance comes from its own folder or from the platform default never
has one.

---

## 4. Theme and core boundary

Platform core owns behaviour, content contracts, routing, authentication,
learner data, accessibility semantics, and stable component hooks. It contains
no named customer-theme selectors and no theme artwork; `npm run theme:boundary`
is the gate that keeps it that way.

A bundle owns appearance and nothing else. It declares its tokens in
`theme.json`, ships `tokens.css` and `portal.css`, and is loaded through generic
theme hooks — never by core reaching for a bundle by name.

---

## 5. Layout bundles

`layout.defaultPreset` is an installed layout bundle id. The platform ships
`standard`, `wide` and `compact` in `web/layouts/`; the Gallery publishes the
same three, and an adopter layout uses the identical declarative contract —
`layout.json` plus `layout.css`, resolved by the same three rules as themes and
hash-locked in the same file.

Layout bundles control structure, density, spacing rhythm and responsive
arrangement through stable hooks. They do not replace behaviour, content,
routing or authentication. Layout is composition; theme is brand.

---

## 6. Adding internal / proprietary courses

You can overlay proprietary corporate courses alongside the open-source
curriculum without modifying core files:

1. Place your course JSON in `custom/modules/` of the content repository
   `project42-portal create` scaffolded beside your front end, and declare how
   they join the catalogue in that repository's overlay catalogue (the seed is
   `web/template/content/custom/catalog.json`).
2. Merge them with the inherited curriculum:
   ```bash
   npm run content:build
   ```
3. `mergeCatalogs` layers your material over the upstream catalogue: a module or
   resource whose id already exists is replaced by yours, a path is merged and
   its module list unioned, and anything new is added. An upstream update
   replaces `upstream/` only and never touches `custom/`.
4. Back in the front-end repository, `npm run app:materialise` regenerates
   `./lib/siteCatalog.generated.json`. That merged file is what the site renders —
   not the platform's own catalogue.

---

## 7. Running turnkey with Docker Compose

The self-hosted stack lives in `self-host/` and brings up four services — the
web portal, PostgreSQL, Keycloak for identity and SSO, and the platform API:

```bash
cd self-host
docker compose up -d
```

- **Web portal**: `http://localhost:3000`
- **Platform API**: `http://localhost:8787`
- **Identity & SSO (Keycloak)**: `http://localhost:8080`

`compose.https.yaml` is the TLS-terminating variant; copy `env.https.example`
alongside it. `self-host/compatibility.json` records the version matrix the
stack is validated against.

---

## 8. Air-gapped intranet deployments

Project 42 is engineered with **zero external CDN dependencies**:

- **Offline fonts** — embedded system font stacks; no font CDN.
- **Embedded SVG icons** — all icons bundled into the templates.
- **Bundled diagrams** — visual architecture guides render offline.
- **Local progress** — zero-config mode stores learner progress in browser
  `localStorage` when no platform API is reachable.

Appearance is offline by construction too: the platform ships its bundles inside
the package, and a Gallery bundle, once synced, lives in your repository under
the lock. Nothing is fetched at render time.

---

## 9. Portal boundaries

The selected theme applies only to the public portal. The Gallery uses a neutral
fixed shell and renders theme packages in isolated previews. Admin uses its
fixed high-contrast operational theme and ignores learner preferences. Keep
learner navigation relative to the canonical public origin; use absolute links
only when crossing to the Gallery, Admin, source repositories or support systems.

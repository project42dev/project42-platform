# {{ORGANIZATION}}

A Project 42 front end. This repository holds **branding, configuration and
release records, and nothing else** — the application itself is installed from
`@project42/platform` at `npm install` time and is git-ignored.

Scaffolded by `project42-portal create` from `@project42/platform`
v{{PLATFORM_VERSION}}.

## What is here, and what is not

| Tracked here | Installed by the platform |
| --- | --- |
| `project42.config.json` — theme, layout, origins, organisation | `app/`, `lib/`, `copy/`, `worker/` |
| `project42.copy.json` — your wording, overriding the platform's defaults | `scripts/`, `tests/` |
| `config/` — roadmap, release notes, link exceptions, budgets, pins | `tsconfig.json` and the build configs |
| `public/brand/` — your artwork | |
| `public/themes/`, `public/layouts/` — Gallery bundles, hash-locked | |
| `CHANGELOG.md`, `.github/workflows/` | |

Editing an installed file is possible but not free: the materialiser refuses to
overwrite anything git tracks, so `git add` on a product file is a deliberate,
visible fork that you then own forever. Prefer configuration and copy overrides.

## First run

```bash
npm install                                        # installs and materialises
npm run themes:sync -- --source ../project42-gallery
npm run bootstrap                                  # facts, brand rasters, notes
npm run build
npm run pages:build && npm run pages:serve         # static preview
```

`npm run doctor` reports anything still missing.

## Changing how it looks

Change one field:

```json
{ "theme": "05-open-orbit" }
```

Then `npm run brand:generate` (favicons are rasterised from the active theme's
mark) and rebuild. Theme and layout bundles come from a Project 42 Gallery and
are pinned by SHA-256 in `config/theme-bundles.lock.json`.

## Changing what it says

Put the leaf you want to change into `project42.copy.json`. Anything you leave
out keeps the platform's wording. The full vocabulary is
`node_modules/@project42/platform/web/copy/`.

```json
{ "home": { "hero": { "headlineEmphasis": "Ship something real." } } }
```

`{org}`, `{tagline}`, `{supportUrl}`, `{origin}`, `{adminOrigin}` and
`{galleryUrl}` are substituted from `project42.config.json`, and `[label](href)`
inside a string renders as a link.

## Changing what it teaches

Curriculum comes from the content repository scaffolded beside this one. It
tracks `project42dev/project42-content` upstream and layers your own modules on
top; see that repository's README.

## Gates

`npm run verify` is the contract: a production audit plus the full `check`
chain — theme boundary, token completeness, surface isolation, PWA, diagrams,
workflow and documentation governance, release governance, lint, typecheck,
build, performance budget, rendered HTML, link integrity, the browser suite,
and the static-export artifact.

## Governance

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to propose a change and what
  `npm run verify` must prove before review.
- [SECURITY.md](SECURITY.md) — how to report a vulnerability privately.
- [SUPPORT.md](SUPPORT.md) — supported surface, compatibility boundary, and
  deprecation policy.

`LICENSE` carries the Apache License 2.0 that covers this repository's code.

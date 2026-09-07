# Project 42 platform v0.104.4

The product ships its own look, and core stops painting one.

A Project 42 site could not have an appearance without reaching for the Gallery. The theme and layout bundles lived only in project42-gallery, arrived through a sync script, and were pinned by a hash lock the build verified -- so a fresh scaffold rendered unstyled until someone checked the Gallery out, and a running site could change appearance underneath its owner when a bundle was re-synced. At the same time core CSS was painting things a theme is supposed to own, so a theme could not actually change them.

Both halves are the same defect: appearance had no single owner.

**The product now ships a complete appearance.** A theme bundle and the three layout bundles live in the package. Installing the platform installs a finished look, with no Gallery checkout, no sync step, no lock file and no network.

**A theme is a folder.** Download one, drop it in at `themes/<id>/` in your own repository, and name it in the single `"theme"` field of `project42.config.json`. Nothing else changes -- not the code, not a build script, not a manifest, not a lock entry. Resolution is: your own folder, then a bundle you already pulled from the Gallery, then the platform default. A theme nothing provides fails the install and says which folder to create.

**Core declares no brand.** Measured over `web/app/globals.css`: 4,106 declarations, 2,667 structure, 1,338 appearance. The appearance that was pinned to a value core had no business choosing has moved to tokens the bundle owns -- 27 places an accent or brand fill was read as text, 31 typefaces named inline, 28 pill radii, nine ramp tracking values, nine `white` fills. `--p42-text-accent` and `--p42-text-emphasis` are the substantive pair: an accent is a fill colour, and read as body copy it can fail contrast while passing its own contract -- which is how near-black text landed on a near-black panel at 1.04:1 in production. Both default to the fill in use today.

**A gate keeps it out.** `npm run theme:boundary` fails on a colour literal, a brand colour used as text, a typeface named inline, a token pinned to a literal outside the fallback layer, and any new hardcoded radius or letter-spacing. Run against core as it stood before this release it reports 65 violations; against core as it stands now, none.

Verified unchanged: 121,231 computed style values across 15 routes, captured from real builds before and after, differ in one place -- an in-flight transition opacity sampled microseconds apart.

## Breaking changes

None for a site that vendors its Gallery bundles: those keep resolving from where they already are.

A site that names a theme no folder provides now fails `npm install` instead of building an unstyled page. Drop the theme folder in at `themes/<id>/`, or name one the platform ships.

Theme bundles must declare seven further tokens -- `--p42-text-accent`, `--p42-text-emphasis`, `--p42-font-body`, `--p42-font-mono`, `--p42-font-mono-display`, `--p42-font-serif` and `--p42-surface-inverse` -- or `tokens:check` fails for them. The bundle the platform ships declares all seven; a Gallery bundle must be republished with them.

## Migrations

None. No database, API or content change.

## Known limitations

Core still carries 102 hardcoded radius and letter-spacing values, 38 distinct. None matches a step in any published layout ramp, so collapsing them would change the rendered page; they are recorded in `web/scripts/appearance-debt.json` and the gate lets the list shrink but never grow.

The Google Fonts `@import` at the top of `web/app/globals.css` still loads the brand typefaces from core, and is the one network dependency the build has. Moving it into the bundle risks a visible change in how type loads, so it is left.

## Rollback

Pin the previous platform version. Nothing outside the package changes, so a site reverts by reinstalling.

---

# Project 42 platform v0.104.3

The curriculum stops being downloaded by browsers that never render it.

Three client components track a learner's progress — `ProgressProvider`, `ProfileDashboard`, `ProgressSnapshot` — and each was handed the whole catalogue. The progress API reads eight fields from it: `contentVersion`, a path's `id`, `title`, `moduleIds` and `badge`, and a module's `id`, `title` and `capstone`. Every module body, knowledge check and source list travelled with them into the browser as the single largest chunk in the bundle.

It had been that way as long as those components have existed. Splitting the catalogue into its own module in v0.104.0 made it visible rather than causing it, by putting the same 1.3 MB in two chunks at once.

Projecting at run time would not have helped: a projection computed from the full object still has the full object in the module graph. So `materialise` generates the projection — the curriculum's shape without its content — into `lib/progressCatalog.generated.ts`, which imports nothing, and `lib/progressCatalog` is what a client component reads.

Measured on the generated template, same build, same content:

| | before | after |
| --- | --- | --- |
| client total | 3,535,749 bytes | 993,821 bytes |
| largest chunk | 1,306,327 bytes | 199,967 bytes |
| projection | — | 48 KiB of the catalogue's 1,625 KiB |

A gate in `tests/web-distribution.test.mjs` fails any `"use client"` module that imports `lib/catalog` directly. It is a direct-import check; the performance budget in a consuming repository is what catches a client component reaching the catalogue through an intermediate module.

## Adding a field

The projection is one function in `bin/project42-portal.mjs`. A progress feature that needs a field the projection does not carry must add it there, and the type cast on the generated value is why that is a deliberate act rather than something that happens by accident.

## Migrations

No file under `migrations/` was added or changed since v0.104.2.

## Breaking changes

None.

## Known limitations

Unchanged from v0.104.0: publishing a content change to a site is three commands, and a generated site's browser suite passes on `06-galactic-guide` but not on `05-open-orbit` or `07-quiet-lantern`.

## Rollback

Revert consuming sites to v0.104.2. They regain 2.5 MB of client payload and lose nothing else.

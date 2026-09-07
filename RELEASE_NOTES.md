# Project 42 platform v0.109.0

The site is usable on a phone.

It had a manifest, a service worker, `apple-mobile-web-app-capable` and `viewport-fit=cover`. Every box was ticked and it was still bad on an iPhone, because the tags were never what was wrong. What follows was measured on real iPhone SE, iPhone 15 and iPhone 15 Pro Max profiles, portrait and landscape, under WebKit -- the engine Mobile Safari actually uses.

**Headings could not get smaller than a desktop size.** Every heading family is sized with a `clamp()` whose FLOOR is a desktop measurement -- `clamp(3.4rem, 7vw, 7.3rem)` cannot resolve below 54.4px, because on any phone the `7vw` term is smaller than the floor and the floor wins. A module page rendered a 54px heading with -0.075em tracking into a 226px column: one word per line, `document.scrollWidth` at 344px against a 320px viewport, and the last word clipped off the right edge. Phone type ramps now sit under `(max-width: 760px)`, and each is chosen to resolve to exactly the floor it replaces AT 760px -- so the seam is continuous and nothing at 761px or wider renders differently.

**The navigation was the first screen.** At phone width the primary nav wrapped into a two-column block occupying roughly 330 of the 568 visible pixels on an iPhone SE, and "Start learning" was `display:none` on every phone. You landed on the site and saw the site map. The nav now collapses behind a 44px disclosure with the action restored as its first item. The links stay in the served HTML and are hidden with CSS, never conditionally rendered, so the link checker, the Pages export and crawlers still see every destination.

**Nothing you had to tap was big enough to tap.** Nine footer links per page at 23.2px tall -- core declared the 44px minimum and `portal-default` reset it to 0 for a tighter desktop footer. The Field Guide card's only action at 45x18px. Module citations at 19px. Breadcrumbs at 18px. All are 44px on a phone now, and the footer minimum is restated in the bundle that gave it away.

**The installed app had an invisible status bar.** `apple-mobile-web-app-status-bar-style: black-translucent` forces the clock and battery glyphs white, and `portal-default` paints a white ground. It is `default` now, which follows the system appearance on a light bundle and on a dark one; `viewport-fit=cover` still lets the page fill the cutout. `<body>` and `.site-footer` were each applying `safe-area-inset-bottom`, stacking two insets under the home indicator; the footer applies it once.

**The home page cost 432.7 KB on cellular.** 90.6 KB of that was a decorative `hero.png`, fetched on the home page and on `/learn/`, and 99.9 KB was a `/guide/` RSC prefetch on every first paint for a link most readers never tap. A phone now gets the hero plate without the picture, and no `/guide/` link prefetches.

**A gate so it cannot come back.** `web/tests/browser/mobile-viewport.spec.ts` runs under WebKit on an iPhone SE, from a new `mobile-webkit` Playwright project. It fails on horizontal overflow, on a heading wider than its own box, on any control under 44x44 CSS px, on a missing safe-area rule for a pinned element, on a nav that is not a disclosure at phone width, and on a text field small enough to make iOS zoom on focus. The chromium project ignores that file and the new project runs nothing else, so neither suite can pass at a width where it proves nothing.

## Breaking changes

None. Every rule added is scoped to `(max-width: 760px)` or is a new class that only renders at phone width, so no viewport of 761px or wider changes.

Adopters running the browser suite in CI must install WebKit alongside Chromium: `npx playwright install --with-deps webkit`.

## Migrations

None. No database, API or content change.

## Known limitations

The safe-area half of the gate reads the CSSOM rather than computed styles. `env(safe-area-inset-*)` resolves to `0px` in every engine under Playwright -- there is no notch to emulate -- so a computed-style assertion would pass on a page with no safe-area handling at all. Whether the installed app genuinely clears the notch can only be confirmed on a device.

`/guide/` still serves a 100 KB HTML document. That is a content-structure question, not a phone one, and is left.

The hosted Entra sign-in page reached from `/profile/` carries controls below 44px. It is Microsoft's markup, not the portal's, and is excluded from the gate.

## Rollback

Pin the previous platform version. Nothing outside the package changes, so a site reverts by reinstalling.

---

# Project 42 platform v0.106.1

The default theme stops being somebody else’s brand.

v0.105.0 made the product ship its own appearance, and that was right. What it shipped as the default was `06-galactic-guide` -- a Gallery theme, copied into the package. So every fresh install rendered in one operator’s livery, and "the default look" and "the Galactic look" became the same sentence. A Gallery theme is a CHOICE. It cannot also be the thing you get when you have not chosen.

**The platform now ships `portal-default`.** A white page, hairline rules, one slate-blue action colour, system type, no ornament. It is the stock theme in the sense Hugo and Jekyll mean it: what a brand-new site renders with before anybody has decided anything, complete enough that the first thing an operator sees is a finished site rather than an unstyled one. It is not in the Gallery and never will be.

It is a complete bundle, not a placeholder. All 48 tokens core reads, every component treatment the portal renders, the heading ramp bound to the layout track tokens, and the four surfaces core stopped painting in v0.105.0 -- the hero plate, the landing ornament, the footer tap target, and the primary action fill. Every foreground/background pair it declares is at or above 4.5:1.

**`project42-portal create` selects it,** with no `--theme` flag needed. `06-galactic-guide` still ships and is still a theme anyone can select; it is simply no longer what you get by default.

**One fix made the swap a one-line change.** `materialise` resolved `availableThemes` and nothing else. `availableThemes` is the switcher’s menu; `theme` is what the site renders, and the two are not the same list -- a site that offers the six Gallery bundles but renders the shipped default names that default in `theme` alone. Such a site installed six bundles and not the one it had actually selected, then rendered on fallback values with every gate green. The selected theme is now always resolved, and `tests/web-distribution.test.mjs` fails if that regresses.

Verified by building a real site both ways and reading computed styles off `/`, `/learn`, `/learn/paths` and `/about`, all 200: changing the one `"theme"` field moves the page ground, the body and heading typefaces, every heading colour, the primary action fill and shape, the eyebrow treatment and the card surface -- and changing it back restores the Galactic rendering exactly.

## Fixed after the first cut (v0.106.1)

Building the real site on `portal-default` found three things the first cut missed, all of them the same shape: a decision core hands the bundle, which a light-accented theme never has to make.

Core fills `.cta`, `.pillar-reference` and `.pillar-ondemand` with the accent, then chooses every text colour inside them for the PAGE ground, and dims the card index to 0.65 and the list to 0.75 without restoring either. On Galactic mint accent with dark text that reads fine. On any accent dark enough to need light text the whole panel falls below 4.5:1 -- 309 axe violations across three suites. `portal-default` now names `--p42-accent-fg` on those panels and takes the opacity back. Core also leaves `justify-content` unset on the header disclosure, so its links compute `normal`; the bundle sets `flex-start`.

And one gate: the browser conformance suite derived every colour and the heading face from the selected bundle, but still asserted `toContain("Inter")` for the body face -- 06-galactic-guide’s own. Any bundle naming another body face failed a required gate for no reason beyond not being that theme, which is the very defect that suite was rewritten to remove. It now reads `--p42-font-body` like the rest.

## Breaking changes

None for an existing site: it names its theme explicitly and keeps rendering it.

A NEW scaffold now renders `portal-default` instead of `06-galactic-guide`. Pass `--theme 06-galactic-guide` to `project42-portal create`, or set the `theme` field afterwards, to get the previous behaviour.

A site whose `theme` is not listed in `availableThemes` now installs that bundle, where before it silently did not. Nothing that worked stops working.

## Migrations

None. No database, API or content change.

## Known limitations

`portal-default` lands in `public/themes/` on every install, like `app/`. A consuming repository must git-ignore it: tracking a platform-shipped bundle makes `materialise` read it as vendored and refuse to refresh it, freezing the default at the version first committed. The scaffolder template already ignores `/public/themes/`; a site predating that template needs the entry added.

The Gallery preview matrix does not yet carry `portal-default`, because the Gallery holds Gallery themes and this one is not one. Previewing the product default beside the themes on offer is unsolved.

## Rollback

Pin v0.105.0 and set `"theme": "06-galactic-guide"`. Nothing outside the package changes.

---

# Project 42 platform v0.105.0

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

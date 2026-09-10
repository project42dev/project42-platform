# Changelog

All notable reusable platform changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and released versions use
semantic versioning.

## [0.110.1] - 2026-09-10

### Fixed

- The database can now store the source 0.110.0 taught the API to accept.
  `progress_imports.source` carries a `CHECK` of its own naming only the two
  import sources, so a widened API alone turned the 400 into a constraint
  violation and still lost the write. Every routine save from a signed-in
  learner was a 500 between v0.110.0 and this release.
  `migrations/0020_account_backed_progress_source.sql` recreates the table with
  the widened constraint -- SQLite cannot alter a `CHECK` -- and
  `self-host/postgres/014_account_backed_progress_source.sql` replaces it in
  place for self-hosted deployments.

### Changed

- `tests/authoritative-progress-api.test.mjs` asserts that a save with
  `source: "account-backed-v1"` is stored in `progress_imports` and read back,
  rather than that the allow-list contains the value. The previous test passed
  throughout the outage because nothing exercised the source the app sends.
- 0.110.0 was released without its governance records. `self-host/compatibility.json`,
  both self-host environment examples, this changelog and the release notes now
  match the package version again.

## [0.110.0] - 2026-09-09

### Fixed

- The API accepts the write the signed-in front end actually makes. The app
  PUTs `/v1/me/progress` with `source: "account-backed-v1"`; that value was in
  no contract, so every routine save was refused with 400
  `invalid_progress_import`. Reads were unaffected, so the failure was silent
  and looked like data loss. The source is added to `ProgressImportRequest`,
  the worker allow-list, `LearningProgressImportSource` and its runtime
  validator, and the learning-event contract schema. It did not persist until
  0.110.1, which widened the column constraint as well.
- A 400 on progress import names the source it received, instead of saying only
  that an import ID and source are required.
- `ProgressProvider` retries hydration with backoff and buffers work done while
  the store is not yet writable. A single failed read previously disabled
  writes for the rest of the session.

## [0.109.0] - 2026-09-07

### Changed

- Reverts 0.108.0. The platform ships its theme bundles again, because a
  deployment of the product is what carries the default appearance: install it,
  deploy it, and it has a look. 0.108.0 removed them and required every site to
  supply a theme before it could install, which left a fresh deployment with no
  appearance at all.
- `project42-portal create` no longer requires `--theme`; it falls back to the
  bundle the product ships.

## [0.107.0] - 2026-09-07

### Added

- A phone gate. `web/tests/browser/mobile-viewport.spec.ts` runs under WebKit
  on an iPhone SE from a new `mobile-webkit` Playwright project and fails the
  build on horizontal overflow, on any control under 44x44 CSS px, on a
  missing safe-area rule for a pinned element, on a nav that is not a
  disclosure at phone width, and on a text field small enough to make iOS zoom
  on focus. The chromium project ignores that file and the new project runs
  nothing else, so neither suite can pass at a width that proves nothing.
- The primary navigation collapses behind a disclosure at 760px and below,
  with the "Start learning" action restored inside it. The links stay in the
  served HTML -- hiding is CSS, never conditional rendering -- so the link
  checker, the GitHub Pages export and crawlers still see every destination.

### Fixed

- Heading families could not get smaller than a desktop size on a phone.
  `clamp(3.4rem, 7vw, 7.3rem)` never resolves below 54.4px, because on any
  phone width the `7vw` term is below the floor and the floor wins. A module
  page therefore rendered a 54px heading with -0.075em tracking into a 226px
  column and pushed `document.scrollWidth` to 344px against a 320px viewport,
  clipping the last word off the screen. Phone ramps now sit under
  `(max-width: 760px)` and each resolves to exactly the floor it replaces AT
  760px, so nothing at 761px or wider changes.
- Tap targets below the 44px minimum on every route: nine footer links at
  23.2px (core declared 44px and `portal-default` reset it to 0 for a tighter
  desktop footer), the Field Guide card's only action at 45x18px, module
  citations at 19px, breadcrumbs at 18px.
- `apple-mobile-web-app-status-bar-style` was `black-translucent`, which
  forces the status-bar glyphs white. On `portal-default`'s white ground an
  installed home-screen app had an invisible clock and battery. It is now
  `default`, which follows the system appearance on a light bundle and on a
  dark one; `viewport-fit=cover` still exposes the cutout to the page.
- `<body>` and `.site-footer` each applied `safe-area-inset-bottom`, stacking
  two insets under the home indicator in the installed app. The footer applies
  it once.
- The home page transferred 432.7 KB to an iPhone: 90.6 KB of decorative
  `hero.png` (also fetched on `/learn/`) and a 99.9 KB `/guide/` RSC prefetch
  on every first paint. The phone now gets the hero plate without the picture,
  and no `/guide/` link prefetches.
- `main.shell` carried 72px above and 128px below its content on a phone, and
  `portal-default` gave the lesson panel a 2rem inset inside a 292px shell.

## [0.106.1] - 2026-09-07

### Fixed

- `portal-default` now takes over the surfaces core fills with the accent --
  `.cta`, `.pillar-reference` and `.pillar-ondemand` -- and names
  `--p42-accent-fg` on them. Core chooses every text colour inside those
  panels for the PAGE ground, and also dims the card index to 0.65 and the
  list to 0.75 without restoring either, so a bundle whose accent is dark
  enough to need light text dropped the whole panel below 4.5:1. A bundle
  whose accent is light never notices, which is why it survived this long.
- `portal-default` sets `justify-content: flex-start` on the header
  disclosure. Core leaves it unset, so the panel’s links compute `normal`
  and read ragged.
- The browser conformance suite derived every colour and the heading face from
  the selected bundle but still asserted `toContain("Inter")` for the body
  face -- 06-galactic-guide’s. Any bundle naming another body face failed a
  required gate for no reason beyond not being that theme. It is now read from
  `--p42-font-body` like the rest.

## [0.106.0] - 2026-09-06

### Added

- `portal-default`, the theme the platform ships as its own default: a white
  page, hairline rules, one action colour, system type and no ornament. It is
  what a fresh install renders with, the way a fresh Hugo or Jekyll site
  renders with the generator’s own stock theme. It is deliberately not a Gallery
  entry.

### Changed

- The scaffolder and every unconfigured install now select `portal-default`
  rather than `06-galactic-guide`. A Gallery theme is a CHOICE; shipping one
  as the default made every new deployment wear another operator’s brand.
- `materialise` now always resolves the SELECTED theme, whether or not
  `availableThemes` lists it. `availableThemes` is the switcher’s menu;
  `theme` is what the site renders. A site that offers the Gallery bundles but
  renders the shipped default previously installed six bundles and not the one
  it had actually selected, and rendered on fallback values with every gate
  green.

## [0.105.0] - 2026-09-06

### Changed

- The product now ships its own theme and layout bundles, so a deployment has
  a complete, intentional appearance with no theme gallery involved. A theme
  folder dropped into a site's own repository takes precedence over everything
  else, and naming it in `project42.config.json` is the only step: no sync, no
  lock entry, no manifest, no code change.
- Core CSS no longer carries appearance. The brand colours used as text, the
  typefaces beside the heading face, the pill radius and the inverted surface
  are tokens a theme owns rather than values the product names. A gate refuses
  a colour literal, a typeface, or a brand colour used as text in core.

## [0.104.4] - 2026-09-06

### Added

- The product ships its own appearance. A complete theme bundle and the three
  layout bundles now live in the package, so installing the platform installs a
  finished look -- no Gallery checkout, no sync step, no lock file, no network.
- A theme is a folder, and choosing one is naming it. A site drops
  `themes/<id>/` into its own repository, sets `"theme"` in
  `project42.config.json`, and the build uses it. Resolution is: the site's own
  folder, then a bundle it already pulled from the Gallery, then the platform
  default. Naming a theme nothing provides fails the install with the folder to
  create, rather than serving an unstyled page.
- `docs/appearance-contract.md` states who owns what a site looks like: what
  core owns, what a theme owns, and what a theme is guaranteed to be able to
  change.

### Changed

- Core CSS declares no brand. The 27 places an accent or brand fill was read as
  text, the 31 typefaces named inline, 28 pill radii, nine ramp tracking values
  and nine `white` fills are now tokens the bundle owns. Each token takes its
  last-resort value once, in the `p42-fallback` layer.
  `--p42-text-accent` and `--p42-text-emphasis` separate "this text carries
  emphasis" from the fill colour it defaults to, so a bundle can make emphasis
  legible in its palette without repainting a surface. Verified unchanged
  against 121,231 computed style values across 15 routes.
- The Gallery lock is what it always described: a record of what a site chose to
  pull from the Gallery, not a prerequisite for having a look. `themes:check`
  passes without one and verifies only the bundles actually locked.

### Fixed

- A bundle pulled from the Gallery survived only if it happened to be tracked by
  git, so on a new scaffold -- which ignores `public/themes/` as build output --
  the next install overwrote it with the platform default, or refused to install
  a theme the platform does not ship. The lock is now the signal.
- `npm run theme:boundary` runs in this repository as well as in a consuming
  site, so a regression in CSS authored here fails here. It enforces five rules
  rather than one: no colour literal, no brand colour as text, no typeface named
  in core, no token pinned outside the fallback layer, and no hardcoded radius or
  letter-spacing beyond a recorded baseline.
- `self-host/compatibility.json` and the two environment examples still named
  0.104.3, so `npm run self-host:validate` failed on a released tree.

## [0.104.3] - 2026-09-06

### Changed

- The three client components that track a learner's progress read a generated
  projection of the catalogue -- `lib/progressCatalog` -- rather than the
  catalogue itself. The progress API reads eight fields from it; every module
  body, knowledge check and source list was being shipped to the browser with
  them, as the largest single chunk in the bundle. Measured on the generated
  template: client total 3,535,749 to 993,821 bytes, largest chunk 1,306,327 to
  199,967 bytes, the projection 48 KiB of the catalogue's 1,625 KiB. A gate in
  `tests/web-distribution.test.mjs` fails any `"use client"` module that
  imports `lib/catalog` directly.

## [0.104.2] - 2026-09-06

### Added

- Lesson pages carry a forward step. Both the written and the on-demand tracks
  end in a pager naming the previous and next module, rendered on the server so
  it is present whether or not the learner takes the knowledge check. The
  on-demand pager mirrors the rail's filmed-versus-written logic, and the last
  module in a path says so and returns to the path rather than showing nothing.
- Resource pages offer related reading from the same category and a way back to
  the Field Guide. A reader who finished one previously had two internal links
  in the whole `<main>`, both of them navigation chrome.
- Visual-guide pages link to the neighbouring guides. `.diagram-next` was a
  `<nav aria-label="More visual guides">` containing a single back link.

### Changed

- Every internal link is emitted in its canonical trailing-slash form. The site
  publishes each route as `<route>/index.html`, so the host answered every
  slashless link with a 301, and the Pages export's static-navigation shim
  turned each internal click into a full document load that paid it. Set
  through `next.config.ts`; the four places that setting does not reach --
  `clientCrossDomainHref`, the retired-path redirect targets, `sitemap.ts`, and
  one raw anchor in a `<video>` fallback -- are corrected at their own source.
  Measured on the exported artifact: 425 non-canonical links before, 0 after.
- `/guide/` renders 24 resource cards with a control for the rest, rather than
  all 91 on load. This removes 72 KB of markup and the layout cost of 67 cards;
  the page's remaining 376 KB is the script payload the browser-side filtering
  needs, which this does not address.
- The Field Guide links resources at `/guide/resources/<id>` and the home page
  links visual guides at `/guide/diagrams/`, matching what `sitemap.ts` has
  always published as canonical. The previously published `/resources/<id>` and
  `/diagrams/` forms still serve, and now declare their canonical URL.
- Learning-path numbers on `/learn/paths/` count within the focus area they are
  displayed in rather than within the flat catalogue, which rendered 11 and 13
  as the first two entries of Focus Area 01.
- `/learn/` no longer repeats the home page below its chooser.

### Fixed

- `galactic-conformance.spec.ts` asserted one theme's palette as raw colour
  literals, so a required gate failed every other theme by construction and the
  scaffold template had to default to `06-galactic-guide`. Expected values now
  come from the selected bundle's `theme.json`, following a `var(--p42-*)`
  alias where one is declared, and the heading typeface is read from
  `--p42-font-heading`. The assertions remain exact colour matches; the site
  header, which a bundle may compose, is asserted to be opaque and to composite
  to a surface the theme declares.

  Running the suite against `05-open-orbit` now reaches 6 of 9 rather than
  failing by construction, and the three that remain fail on measurements
  rather than on having the wrong palette. Correcting the attribution in commit
  `e805abf`, which called both defects bundle-side: the 860 and 128 axe
  colour-contrast violations have one root cause, and it is **shared**. Core
  paints body text with `--lime`, which aliases `--p42-accent`, in about twenty
  selectors -- `.progress-strip strong` and `.knowledge-check .eyebrow` among
  them, which are the nodes that fail. That default only works for a theme
  whose accent is legible as text on its own page, and `05-open-orbit`'s
  declared accent (`#65c943`) is 1.95:1 on its `--p42-bg` (`#f4f7fb`). Whether
  the answer is a text-safe accent in every bundle or a token in core that the
  theme contract actually measures for text depends on whether the contract
  intends `--p42-accent` to be text-safe at all -- its 112 measured pairs do not
  cover this one. Not resolved here, because it is a contract decision rather
  than a defect with an obvious owner. The `.footer-grid a` alignment failure is
  separately bundle-side.
- The link-integrity crawler fetched routes in the slashless form. Once routes
  answered `308` for that form, every route returned no `text/html` body, so
  the crawler extracted zero references from all 338 of them and still reported
  success. It requests the canonical form now, and fails when an inventory
  route answers anything but `200` or serves no HTML, so a gate covering 22,010
  references cannot silently come to cover none.
- `/resources/<id>` and `/guide/resources/<id>` were byte-identical files
  maintained in parallel. The previously published route re-exports the
  canonical one.
- Three of 91 resource cards printed their category twice, because format and
  category coincide for a Reference in the Reference category.
- `.ondemand-status`, `.lesson-video-note` and `.lesson-preview-video`
  hardcoded radii, so a layout switch could not move them.
- A freshly cloned content repository failed its own `content:check` on
  Windows having changed nothing. `.vtt` was missing from the extensions the
  hash normaliser treats as text, so git's line-ending conversion on checkout
  made 40 caption files look like 41 curriculum differences. The list now
  covers every text form the curriculum is authored in, and the content
  scaffold ships a `.gitattributes` marking `upstream/**` as not-text so the
  bytes the lock covers survive a checkout unchanged. The same list in the
  platform's own `scripts/sync-content.mjs` is corrected with it.
- `project42-portal create` renames `gitattributes` as well as `gitignore` on
  the way out, since npm will not publish either under its real name.

## [0.104.1] - 2026-09-06

### Fixed

- A scaffolded front end keyed `allowScripts` by the dependency spec
  (`"github:project42dev/project42-platform#v0.104.0"`). npm matches that field
  by package name, so the entry covered nothing and every install warned that
  `@project42/platform`'s `prepare` script -- the script that compiles `dist/`,
  which is the entire front end -- was unapproved. npm warns and runs it today;
  the day it enforces, an install would produce a package with no `dist/` and
  the adopter's first build would fail at its first import. Approved by name
  now, together with `esbuild`, `workerd`, `unrs-resolver` and `sharp`, whose
  install scripts fetch or compile the binaries the build needs.
  `tests/web-distribution.test.mjs` asserts both that each is approved and that
  no key is a dependency spec.

## [0.104.0] - 2026-09-06

### Added

- A site now renders the merged catalogue its own content repository publishes.
  `project42-portal materialise` resolves it and installs it as
  `lib/siteCatalog.generated.ts` (imported by the application) and
  `lib/siteCatalog.generated.json` (read by the `.mjs` gates, which cannot
  import TypeScript), written from one value in one call so they cannot
  disagree. Resolution has exactly two outcomes: the content repository's
  `dist/catalog.json` when `content.customContentDir` is declared, the
  platform's own catalogue when it is not.
- `PROJECT42_CONTENT_DIR` overrides the configured content path, for CI where
  `actions/checkout` cannot write above the workspace. The scaffolded
  workflows use it: each job that installs now checks the sibling content
  repository out and builds its catalogue first.
- `materialise` prunes files the product no longer ships, deciding per file
  from the consuming repository's own `.gitignore` -- ignored under a
  materialised root means build input, tracked or un-ignored means a declared
  fork, which it leaves alone and names in its report. Outside a git repository
  it prunes nothing.
- `doctor` reports a configured content repository whose catalogue has not been
  built, and a front end with no catalogue installed.
- `CatalogMetadata.inheritedFrom`, the provenance a downstream catalogue carries
  through the merge.

### Fixed

- `content.customContentDir` was written into a scaffolded front end's
  configuration and read by nothing, so an adopter's own module merged
  correctly into their content repository's `dist/catalog.json` and never
  appeared on their site. Inheritance was proven at one end and rendering at
  the other, with nothing joining them.
- A configured content repository whose catalogue is missing, unparseable,
  empty or the wrong shape now fails the install naming the command that fixes
  it. It never falls back to the platform's own catalogue: a site silently
  missing its operator's content is indistinguishable, from outside, from a
  site that never had any.
- Two `rendered-html` gates asserted fixed module counts on inherited learning
  paths (sixteen on AI Foundations, twelve on reliable-agent workflows with the
  capstone last), so a deployment that attached one module of its own to an
  inherited path failed a product gate for doing exactly what the inheritance
  model is for.
- `LessonPager` was imported by two module pages and not shipped, so a
  consuming repository materialised pages that could not compile.

### Changed

- The package declares `sideEffects: false`. Without it a consuming bundler
  must assume every module might act on import, so importing anything at all
  pulled the compiled canonical curriculum into the client bundle -- 1.3 MB
  that a site rendering its own merged catalogue would then ship twice.
- Every page, script and gate under `web/` reads `lib/catalog.ts` instead of
  importing `starterCatalog` from the package, so a deployment's curriculum has
  one source.

## [0.103.5] - 2026-09-06

### Fixed

- `tests/github-pages-export.test.mjs` asserted that the Admin redirect in the
  static artifact points at one deployment's Admin host. The exporter reads
  `portal.adminOrigin` and had emitted the right URL; the gate then failed the
  build for it. It reads the same value now.

With this, a front-end repository produced by `project42-portal create`
passes `npm run verify` in full -- the production audit and all twenty gates,
including the Playwright browser suite, link integrity across every route it
publishes, and the static-export artifact -- with no file edited after
generation.

## [0.103.4] - 2026-09-06

### Fixed

- The protected-profile authentication boundary test was not hermetic, which
  only became visible once v0.103.3 let it resolve its origin from
  configuration and it therefore started running outside CI. It stubbed the
  auth-start hand-off but not the session and registration probes
  AuthProvider makes first, so it reached whatever host the configuration
  named -- a live production API for the deployment that owns it, nothing at
  all for a scaffolded one -- and timed out after a full minute instead of
  asserting anything. It answers those probes itself now, and passes against
  a real origin, a stub origin, and none.
- `tests/browser/galactic-conformance.spec.ts` failed to typecheck in a
  repository whose `content` block declares only upstream fields; the
  instructor-media read is widened.

## [0.103.3] - 2026-09-06

### Fixed

The last of the browser gates that named one deployment. Found by running a
generated front end's own Playwright suite.

- Every browser spec resolved the account API from
  `NEXT_PUBLIC_PROJECT42_API_ORIGIN` alone. A deployment that declares
  `portal.apiOrigin` in configuration -- the supported way since v0.103.0 --
  therefore looked unconfigured to its own tests, and one spec built the
  string `undefined/v1/auth/start` and waited sixty seconds for a request
  that could never arrive. All eight specs resolve it the way AuthProvider
  does.
- `tests/browser/brand.spec.ts` fetched one operator's mark by filename. It
  reads `branding.mark`, which exists for exactly this reason.
- `tests/browser/galactic-conformance.spec.ts` asserted a menu link labelled
  "About Project 42" and required an instructor-led lesson route to answer
  200. The first is `organization.name`; the second exists only where the
  deployment serves that lesson's media, so it is asserted only when it does.

## [0.103.2] - 2026-09-06

### Fixed

Five more gates that could only ever pass for one deployment. Every one was
found by running a generated front end's own `npm run verify`, which is the
first time these files had been executed anywhere but `project-42.dev`.

- The route inventory disagreed with the application about instructor-led
  lessons. `link-integrity.mjs` built `/ondemand/<path>/<module>` from every
  rendering the curriculum declares, while `app/lib/instructorMedia.ts` (since
  v0.103.1) offers only the ones this deployment hosts. The static exporter
  then tried to export a route the app returns 404 for, and the build stopped.
  Both now read `content.instructorMedia`.
- `tests/workflow-governance.test.mjs` listed four workflow filenames, one of
  them `ado-sync.yml` -- one owner's private issue mirror. A repository without
  that file could not run the gate at all, and a repository that added a fifth
  workflow was never checked. It discovers every workflow instead, and decides
  which is a deployment workflow by whether it deploys rather than by its name.
- `tests/release-governance.test.mjs` asserted the version `0.19.0`, so the
  gate could pass only for one repository and only until its next release. It
  reads the version the repository declares.
- `tests/rendered-html.test.mjs` asserted `theme-color: #090d16` and a
  `short_name` of `Project 42` -- 06-galactic-guide's background and one
  operator's name. Both come from the selected bundle's tokens and
  `organization.name` now. It also required the retired-learning-path map to be
  non-empty, which failed a new deployment for having no history; that case is
  skipped rather than failed, and every ID the map does name is still checked.
- `tests/browser/account-progress.spec.ts` decided whether hosted identity was
  configured from the environment variable alone, so a deployment that declared
  `portal.apiOrigin` in configuration -- the supported way -- took the
  unconfigured branch and asserted a screen it does not render.

### Changed

- The scaffold template ships the release plumbing its own gates require: a
  `release.yml` whose tokens `release-governance.mjs` checks for, and a
  `RELEASE_NOTES.md` with the four sections it requires non-empty. Its CI and
  Pages workflows are rebuilt to the contract the workflow gate enforces --
  every action pinned to an immutable commit SHA, per-job permissions, and a
  separate validation job before anything is published.

## [0.103.1] - 2026-09-06

### Fixed

- A route was missing from the published package. `.gitignore` carried an
  unanchored `logs` pattern, which matched `web/app/admin/logs` -- a real
  route of the front-end application. `npm pack` here produced a complete
  tarball and the tarball npm builds when installing this package as a git
  dependency did not, so a consuming site 404ed a page its own link gate had
  inventoried, and nothing in either repository could see it. The pattern is
  anchored, and `tests/web-distribution.test.mjs` now asserts that no tracked
  file under `web/`, `bin/` or `schemas/` matches any ignore rule.
- Instructor-led lessons are offered only where the deployment hosts the media.
  The curriculum declares that a lesson was filmed; the media key is a bare
  filename, so an adopter inherits the manifest and no video, and the page
  published a player pointing at a 404. A deployment now lists the keys it
  serves under `content.instructorMedia` in `project42.config.json`, and the
  lookup fails closed: an absent or empty list means no instructor-led lessons.
- `generate-release-facts.mjs` can own the README fact block. The gate requires
  every generated fact to appear in the README, which a running deployment can
  satisfy and a freshly scaffolded one cannot -- the catalogue counts are not
  knowable until the platform is installed. A README may now delegate the block
  between two markers, which the generator rewrites. `--check` still only
  asserts, so CI still catches a README that drifted.

### Changed

- The scaffold template is complete enough to build unmodified: `package.json`
  carries the `repository` and `bugs` identity the release-facts gate
  cross-checks against `config/project-metadata.json`, that file gains
  `providerIds` and resolvable licence URLs, `CHANGELOG.md` uses the heading
  form the release-notes compiler parses, `config/link-check-exceptions.json`
  is seeded with the allowances a fresh scaffold needs, and `README.md` carries
  the release-facts markers.

## [0.103.0] - 2026-09-06

### Added

- The front end. `web/` now holds the entire rendering application - 149 files
  of routes, components, the design system, the Cloudflare Worker entry, the
  build toolchain and the twenty gates that police them. Until this release the
  platform had no front end at all: `web/` was two files, no React, no CSS and
  no route, while the whole application was vendored in one deployment's
  repository. The adopter path could not end in "a working front end" because
  the front end was not part of the product.
- `project42-portal`, the adopter CLI, shipped as this package's `bin`.
  `create` scaffolds a front-end repository and a content repository side by
  side with content inheritance wired between them; `materialise` installs the
  application into a front-end repository and is what that repository's
  `postinstall` runs; `doctor` reports what a repository is still missing.
  Materialise refuses to overwrite a git-tracked file, so a deliberate fork is
  an error rather than a silent clobber.
- A copy layer. Every user-visible sentence on the marketing and policy pages
  lives in `web/copy/`, one module per page, carrying the Project 42 wording
  verbatim as the default. An adopter overrides any leaf in
  `project42.copy.json` instead of forking the page that renders it.
  `{org}`, `{origin}`, `{adminOrigin}`, `{galleryUrl}`, `{tagline}` and
  `{supportUrl}` interpolate from configuration, and a bracketed label followed by a parenthesised URL inside a
  string renders as a link.
- `web/template/`, the seed `create` copies: a front-end repository holding
  only branding, configuration and release records, and a content repository
  that inherits `project42-content` into `upstream/` while keeping local
  material in `custom/`, merged by `mergeCatalogs`.
- `tests/web-distribution.test.mjs`, the gate for all of the above. It asserts
  the package ships the application, that materialise installs it and refuses to
  clobber a fork, that create produces two repositories with no unsubstituted
  tokens, and that no `project-42.dev` origin survives in product code.

### Changed

- `schemas/portal-config.schema.json` gains optional `portal.apiOrigin` and a
  `branding` block naming this deployment's own brand source filenames.
  Both were hard-coded in product code: the account API defaulted to one
  deployment's host, so an adopter who forgot an environment variable pointed
  their learners at somebody else's account service.
- `governance-docs-validation.mjs` derives the security-advisories URL from
  `config/project-metadata.json` and accepts any `# Contributing ...` heading,
  so a repository that is not `project-42.dev` can pass its own gate.

### Removed

- `scripts/build-portal.mjs`, a static portal generator that read a third copy
  of the theme bundles out of `docs/branding/concepts/` and modelled a theme as
  five colour strings. Principle 3 of the architecture makes a theme a
  version-locked Gallery bundle selected by ID; the generator contradicted it
  and would have become a rival to the front end this release ships. `npm run
  portal:build` is replaced by `project42-portal create`.
- `web/src/lib/config.ts` and `web/src/lib/storage.ts`, a rival `PortalConfig`
  and a second learner-progress store. Neither was imported anywhere.

## [0.102.0] - 2026-09-06

### Added

- Instructor renderings are part of the content contract. A filmed lesson is
  declared in `project42-content` at
  `training/<path>/<module>/instructor-rendering.json`, beside the class script
  it was rendered from. The platform validates each manifest against that
  script - same id, same version, no more segments than the script has - and
  exports `instructorRenderings` and `getInstructorRendering`. Consuming sites
  no longer keep their own list of which lessons exist.
- `InstructorRenderingManifest` and `validateInstructorRenderingManifest`. This
  is the preview tier, distinct from `VirtualInstructorMediaManifest`, which
  describes a released lesson and requires provenance a preview render does not
  have. A rendering must disclose that the instructor is synthetic, and its
  media key must be a bare filename so no deployment's directory layout reaches
  the shared contract.

### Changed

- `content/training/coverage.json` gains `renderedModuleCount` and marks the
  entry for any module that has been filmed.
- The curriculum is synced to `project42-content@bb00b9a`, which corrects five
  module citations that did not support their module and adds a content-side
  validator for instructor scripts.

## [0.101.0] - 2026-09-05

### Changed

- The curriculum is now installed from `project42-content`, the canonical
  content repository, rather than from a copy vendored in this repository.
  `config/content.lock.json` records the upstream commit and a hash of every
  installed file; `content:check` verifies the tree without network access, so
  an air-gapped build still works while editing curriculum here fails the build.
- `content-sync.yml` checks out the content repository and no longer swallows a
  failed sync.
- The catalogue this ships is now the six-domain structure: 14 learning paths
  where v0.100.0 had 13, and a catalogue roughly twice the size.

## [0.100.0] - 2026-08-23

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.99.0.

## [0.99.0] - 2026-08-23

### Added

- `content/modules/advanced-rag-engineering/advanced-rag-capstone.json`
- `content/modules/advanced-rag-engineering/chunking-strategies-in-practice.json`
- `content/modules/advanced-rag-engineering/graph-rag-and-knowledge-graphs.json`
- `content/modules/advanced-rag-engineering/hybrid-search-and-reranking.json`
- `content/modules/advanced-rag-engineering/rag-evaluation-and-triad.json`
- `content/modules/adversarial-ai-security-and-red-teaming/adversarial-security-capstone.json`
- `content/modules/adversarial-ai-security-and-red-teaming/jailbreaking-and-prompt-injection.json`
- `content/modules/adversarial-ai-security-and-red-teaming/llm-red-teaming-methodology.json`
- `content/modules/adversarial-ai-security-and-red-teaming/owasp-top-10-for-llms.json`
- `content/modules/deepseek-in-practice/deepseek-api-and-cost-optimization.json`
- `content/modules/deepseek-in-practice/deepseek-reasoning-and-moe-patterns.json`
- `content/modules/deepseek-in-practice/navigate-deepseek-ecosystem.json`
- `content/modules/mistral-in-practice/mistral-function-calling-and-codestral.json`
- `content/modules/mistral-in-practice/mistral-multimodal-and-embeddings.json`
- `content/modules/mistral-in-practice/navigate-mistral-ecosystem.json`
- `content/modules/model-customization-and-fine-tuning/customization-decision-matrix.json`
- `content/modules/model-customization-and-fine-tuning/dataset-curation-and-dpo.json`
- `content/modules/model-customization-and-fine-tuning/fine-tuning-eval-and-quantization.json`
- `content/modules/model-customization-and-fine-tuning/lora-and-qlora-tuning.json`
- `content/modules/model-customization-and-fine-tuning/model-customization-capstone.json`

### Changed

- `content/catalog.json`
- `content/source-registry.json`

## [0.98.0] - 2026-08-23

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.97.1.

## [0.97.0] - 2026-08-23

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.96.0.

## [0.96.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.95.0.

## [0.95.0] - 2026-08-22

### Changed

- `content/catalog.json`
- `content/modules/agentic-ai-literacy/agentic-ai-layers.json`
- `content/modules/agentic-ai-literacy/agentic-classification-capstone.json`
- `content/modules/agentic-ai-literacy/agentic-control-flow.json`
- `content/modules/agentic-ai-literacy/agentic-product-comparison.json`
- `content/modules/agentic-ai-literacy/agentic-tools-state-authority.json`
- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/what-ai-does.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/anthropic-claude-practice/anthropic-ecosystem-and-interfaces.json`
- `content/modules/anthropic-claude-practice/claude-api-and-sdk-workflows.json`
- `content/modules/anthropic-claude-practice/claude-evaluation-and-observability.json`
- `content/modules/anthropic-claude-practice/claude-prompting-in-practice.json`
- `content/modules/anthropic-claude-practice/claude-safety-and-trust-boundaries.json`
- `content/modules/anthropic-claude-practice/claude-tools-and-agent-loops.json`
- `content/modules/anthropic-claude-practice/migrating-to-and-from-claude.json`
- `content/modules/google-gemini-practice/gemini-api-and-sdk-workflows.json`
- `content/modules/google-gemini-practice/gemini-ecosystem-and-interfaces.json`
- `content/modules/google-gemini-practice/gemini-evaluation-and-observability.json`
- `content/modules/google-gemini-practice/gemini-prompting-in-practice.json`
- `content/modules/google-gemini-practice/gemini-safety-and-trust-boundaries.json`
- `content/modules/google-gemini-practice/gemini-tools-and-agent-loops.json`
- `content/modules/google-gemini-practice/migrating-to-and-from-gemini.json`
- `content/modules/openai-practice/migrating-to-and-from-openai.json`
- `content/modules/openai-practice/openai-ecosystem-and-interfaces.json`
- `content/modules/openai-practice/openai-evaluation-and-observability.json`
- `content/modules/openai-practice/openai-prompting-in-practice.json`
- `content/modules/openai-practice/openai-responses-api-and-sdk-workflows.json`
- `content/modules/openai-practice/openai-safety-and-trust-boundaries.json`
- `content/modules/openai-practice/openai-tools-and-codex-agent-loops.json`
- `content/modules/provider-comparison/compare-provider-capabilities.json`
- `content/modules/provider-comparison/execute-cross-provider-cutover.json`
- `content/modules/provider-comparison/plan-cross-provider-migration.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`

## [0.94.0] - 2026-08-22

### Changed

- `content/catalog.json`
- `content/modules/agentic-ai-literacy/agentic-ai-layers.json`
- `content/modules/agentic-ai-literacy/agentic-classification-capstone.json`
- `content/modules/agentic-ai-literacy/agentic-control-flow.json`
- `content/modules/agentic-ai-literacy/agentic-product-comparison.json`
- `content/modules/agentic-ai-literacy/agentic-tools-state-authority.json`
- `content/modules/agentic-systems-and-mcp/agent-architecture-spectrum.json`
- `content/modules/agentic-systems-and-mcp/agent-safety-and-spend-brakes.json`
- `content/modules/agentic-systems-and-mcp/model-context-protocol-mcp.json`
- `content/modules/agentic-systems-and-mcp/multi-agent-orchestration.json`
- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/what-ai-does.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/ai-literacy-and-mental-models/ai-mental-models.json`
- `content/modules/ai-literacy-and-mental-models/prompt-architecture.json`
- `content/modules/ai-literacy-and-mental-models/token-economics-and-limits.json`
- `content/modules/ai-security-and-governance/ai-compliance-and-crypto-receipts.json`
- `content/modules/ai-security-and-governance/guardrails-and-sandboxing.json`
- `content/modules/ai-security-and-governance/owasp-top-10-llm-attacks.json`
- `content/modules/anthropic-claude-practice/anthropic-ecosystem-and-interfaces.json`
- `content/modules/anthropic-claude-practice/claude-api-and-sdk-workflows.json`
- `content/modules/anthropic-claude-practice/claude-evaluation-and-observability.json`
- `content/modules/anthropic-claude-practice/claude-prompting-in-practice.json`
- `content/modules/anthropic-claude-practice/claude-safety-and-trust-boundaries.json`
- `content/modules/anthropic-claude-practice/claude-tools-and-agent-loops.json`
- `content/modules/anthropic-claude-practice/migrating-to-and-from-claude.json`
- `content/modules/developer-and-practitioner-ai/function-calling-and-tools.json`
- `content/modules/developer-and-practitioner-ai/provider-sdk-patterns.json`
- `content/modules/developer-and-practitioner-ai/structured-outputs-mastery.json`
- `content/modules/developer-and-practitioner-ai/vector-embeddings-and-pgvector.json`
- `content/modules/google-gemini-practice/gemini-api-and-sdk-workflows.json`
- `content/modules/google-gemini-practice/gemini-ecosystem-and-interfaces.json`
- `content/modules/google-gemini-practice/gemini-evaluation-and-observability.json`
- `content/modules/google-gemini-practice/gemini-prompting-in-practice.json`
- `content/modules/google-gemini-practice/gemini-safety-and-trust-boundaries.json`
- `content/modules/google-gemini-practice/gemini-tools-and-agent-loops.json`
- `content/modules/google-gemini-practice/migrating-to-and-from-gemini.json`
- `content/modules/openai-practice/migrating-to-and-from-openai.json`
- `content/modules/openai-practice/openai-ecosystem-and-interfaces.json`
- `content/modules/openai-practice/openai-evaluation-and-observability.json`
- `content/modules/openai-practice/openai-prompting-in-practice.json`
- `content/modules/openai-practice/openai-responses-api-and-sdk-workflows.json`
- `content/modules/openai-practice/openai-safety-and-trust-boundaries.json`
- `content/modules/openai-practice/openai-tools-and-codex-agent-loops.json`
- `content/modules/provider-comparison/compare-provider-capabilities.json`
- `content/modules/provider-comparison/execute-cross-provider-cutover.json`
- `content/modules/provider-comparison/plan-cross-provider-migration.json`
- `content/modules/rag-and-fine-tuning-engineering/advanced-rag-and-hybrid-search.json`
- `content/modules/rag-and-fine-tuning-engineering/dpo-and-model-evaluation.json`
- `content/modules/rag-and-fine-tuning-engineering/graph-rag-and-knowledge-graphs.json`
- `content/modules/rag-and-fine-tuning-engineering/lora-qlora-fine-tuning.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-and-aiops/hardware-and-vram-calculator.json`
- `content/modules/self-hosted-and-aiops/open-weights-and-quantization.json`
- `content/modules/self-hosted-and-aiops/production-vllm-and-ollama.json`
- `content/modules/self-hosted-and-aiops/semantic-caching-and-ai-tracing.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`
- `content/training/coverage.json`

## [0.93.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.92.0.

## [0.92.0] - 2026-08-22

### Added

- `content/modules/agentic-systems-and-mcp/agent-architecture-spectrum.json`
- `content/modules/agentic-systems-and-mcp/agent-safety-and-spend-brakes.json`
- `content/modules/agentic-systems-and-mcp/model-context-protocol-mcp.json`
- `content/modules/agentic-systems-and-mcp/multi-agent-orchestration.json`
- `content/modules/ai-literacy-and-mental-models/ai-mental-models.json`
- `content/modules/ai-literacy-and-mental-models/prompt-architecture.json`
- `content/modules/ai-literacy-and-mental-models/token-economics-and-limits.json`
- `content/modules/ai-security-and-governance/ai-compliance-and-crypto-receipts.json`
- `content/modules/ai-security-and-governance/guardrails-and-sandboxing.json`
- `content/modules/ai-security-and-governance/owasp-top-10-llm-attacks.json`
- `content/modules/developer-and-practitioner-ai/function-calling-and-tools.json`
- `content/modules/developer-and-practitioner-ai/provider-sdk-patterns.json`
- `content/modules/developer-and-practitioner-ai/structured-outputs-mastery.json`
- `content/modules/developer-and-practitioner-ai/vector-embeddings-and-pgvector.json`
- `content/modules/rag-and-fine-tuning-engineering/advanced-rag-and-hybrid-search.json`
- `content/modules/rag-and-fine-tuning-engineering/dpo-and-model-evaluation.json`
- `content/modules/rag-and-fine-tuning-engineering/graph-rag-and-knowledge-graphs.json`
- `content/modules/rag-and-fine-tuning-engineering/lora-qlora-fine-tuning.json`
- `content/modules/self-hosted-and-aiops/hardware-and-vram-calculator.json`
- `content/modules/self-hosted-and-aiops/open-weights-and-quantization.json`
- `content/modules/self-hosted-and-aiops/production-vllm-and-ollama.json`
- `content/modules/self-hosted-and-aiops/semantic-caching-and-ai-tracing.json`

### Changed

- `content/catalog.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/discovery/cost.json`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/executive.json`
- `content/modules/discovery/fine-tuning.json`
- `content/modules/discovery/langchain.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`
- `content/training/coverage.json`

## [0.91.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.90.0.

## [0.90.0] - 2026-08-22

### Changed

- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`
- `content/training/coverage.json`

## [0.89.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.88.0.

## [0.88.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.87.0.

## [0.87.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.86.0.

## [0.86.0] - 2026-08-22

### Changed

- `content/modules/agentic-ai-literacy/agentic-ai-layers.json`
- `content/modules/agentic-ai-literacy/agentic-classification-capstone.json`
- `content/modules/agentic-ai-literacy/agentic-control-flow.json`
- `content/modules/agentic-ai-literacy/agentic-product-comparison.json`
- `content/modules/agentic-ai-literacy/agentic-tools-state-authority.json`
- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/anthropic-claude-practice/anthropic-ecosystem-and-interfaces.json`
- `content/modules/anthropic-claude-practice/claude-api-and-sdk-workflows.json`
- `content/modules/anthropic-claude-practice/claude-evaluation-and-observability.json`
- `content/modules/anthropic-claude-practice/claude-prompting-in-practice.json`
- `content/modules/anthropic-claude-practice/claude-safety-and-trust-boundaries.json`
- `content/modules/anthropic-claude-practice/claude-tools-and-agent-loops.json`
- `content/modules/anthropic-claude-practice/migrating-to-and-from-claude.json`
- `content/modules/google-gemini-practice/gemini-api-and-sdk-workflows.json`
- `content/modules/google-gemini-practice/gemini-ecosystem-and-interfaces.json`
- `content/modules/google-gemini-practice/gemini-evaluation-and-observability.json`
- `content/modules/google-gemini-practice/gemini-prompting-in-practice.json`
- `content/modules/google-gemini-practice/gemini-safety-and-trust-boundaries.json`
- `content/modules/google-gemini-practice/gemini-tools-and-agent-loops.json`
- `content/modules/google-gemini-practice/migrating-to-and-from-gemini.json`
- `content/modules/openai-practice/migrating-to-and-from-openai.json`
- `content/modules/openai-practice/openai-ecosystem-and-interfaces.json`
- `content/modules/openai-practice/openai-evaluation-and-observability.json`
- `content/modules/openai-practice/openai-prompting-in-practice.json`
- `content/modules/openai-practice/openai-responses-api-and-sdk-workflows.json`
- `content/modules/openai-practice/openai-safety-and-trust-boundaries.json`
- `content/modules/openai-practice/openai-tools-and-codex-agent-loops.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`

## [0.83.0] - 2026-08-21

### Changed

- `content/catalog.json`
- `content/modules/agentic-ai-literacy/agentic-ai-layers.json`
- `content/modules/agentic-ai-literacy/agentic-classification-capstone.json`
- `content/modules/agentic-ai-literacy/agentic-control-flow.json`
- `content/modules/agentic-ai-literacy/agentic-product-comparison.json`
- `content/modules/agentic-ai-literacy/agentic-tools-state-authority.json`
- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/what-ai-does.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/anthropic-claude-practice/anthropic-ecosystem-and-interfaces.json`
- `content/modules/anthropic-claude-practice/claude-api-and-sdk-workflows.json`
- `content/modules/anthropic-claude-practice/claude-evaluation-and-observability.json`
- `content/modules/anthropic-claude-practice/claude-prompting-in-practice.json`
- `content/modules/anthropic-claude-practice/claude-safety-and-trust-boundaries.json`
- `content/modules/anthropic-claude-practice/claude-tools-and-agent-loops.json`
- `content/modules/anthropic-claude-practice/migrating-to-and-from-claude.json`
- `content/modules/discovery/fine-tuning.json`
- `content/modules/discovery/vector.json`
- `content/modules/google-gemini-practice/gemini-api-and-sdk-workflows.json`
- `content/modules/google-gemini-practice/gemini-ecosystem-and-interfaces.json`
- `content/modules/google-gemini-practice/gemini-evaluation-and-observability.json`
- `content/modules/google-gemini-practice/gemini-prompting-in-practice.json`
- `content/modules/google-gemini-practice/gemini-safety-and-trust-boundaries.json`
- `content/modules/google-gemini-practice/gemini-tools-and-agent-loops.json`
- `content/modules/google-gemini-practice/migrating-to-and-from-gemini.json`
- `content/modules/openai-practice/migrating-to-and-from-openai.json`
- `content/modules/openai-practice/openai-ecosystem-and-interfaces.json`
- `content/modules/openai-practice/openai-evaluation-and-observability.json`
- `content/modules/openai-practice/openai-prompting-in-practice.json`
- `content/modules/openai-practice/openai-responses-api-and-sdk-workflows.json`
- `content/modules/openai-practice/openai-safety-and-trust-boundaries.json`
- `content/modules/openai-practice/openai-tools-and-codex-agent-loops.json`
- `content/modules/provider-comparison/compare-provider-capabilities.json`
- `content/modules/provider-comparison/execute-cross-provider-cutover.json`
- `content/modules/provider-comparison/plan-cross-provider-migration.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`

## [0.82.0] - 2026-08-20

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.81.0.

## [0.80.0] - 2026-08-20

### Added

- `content/modules/discovery/cost.json`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/executive.json`
- `content/modules/discovery/langchain.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/voice-agent.json`

### Changed

- `content/catalog.json`

## [0.79.0] - 2026-08-20

### Added

- `content/modules/discovery/rag.json`

### Changed

- `content/catalog.json`

## [0.78.0] - 2026-08-20

### Changed

- `content/training/ai-foundations/what-ai-does/alternatives/en-US-reduced-motion.md`
- `content/training/ai-foundations/what-ai-does/alternatives/en-US-text-only.md`
- `content/training/ai-foundations/what-ai-does/transcripts/en-US.md`

## [0.77.0] - 2026-08-20

### Changed

- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`

## [0.76.0] - 2026-08-20

### Added

- `content/modules/discovery/fine-tuning.json`
- `content/modules/discovery/vector.json`

### Changed

- `content/catalog.json`

## [0.75.0] - 2026-08-19

### Changed

- `content/catalog.json`
- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`

## [0.74.0] - 2026-08-19

### Added

- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`

## [0.72.1] - 2026-08-06

### Added

- Pending account requests can persist required terms acceptance through their
  private registration receipt without receiving a learner session.

### Fixed

- Current terms acceptance is now idempotent and database-enforced as one grant
  per learner and policy version across registration and signed-in retries.

## [0.72.0] - 2026-08-04

### Added

- Centralized Mermaid diagram sources and catalogue under `content/diagrams/`,
  with a `catalogue.json` export for downstream consumers.

### Changed

- All 66 Learn modules now carry explicit `reviewCadenceDays` and `lastVerified`
  currency fields.
- Recovery contract version bumped to 1.2.

## [0.71.0] - 2026-08-01

### Added

- An `ACCOUNT_NOTIFICATION_DELIVERY` Worker provides a provider-neutral delivery
  adapter for account notifications, with a Resend implementation behind
  `POST /v1/deliver`. The account service reaches it through a service binding,
  so the delivery provider can be replaced without changing account logic.
- Learners can complete, fetch the receipt for, and roll back their own account
  reconciliation through `/v1/me/account-merges/:id/{complete,receipt,rollback}`.
  Each route requires the caller to be the source or survivor of that merge.
  Owner involvement is no longer required for a learner to resolve their own
  duplicate account.
- An optional `SESSION_COOKIE_DOMAIN` variable scopes the browser session cookie
  across sibling subdomains. Leaving it unset preserves the previous host-only
  behavior exactly.

### Changed

- The browser session cookie is named `__Secure-project42_session` rather than
  `__Host-project42_session`. A `__Host-` cookie carrying a `Domain` attribute is
  rejected outright by the browser under RFC 6265bis §4.1.3, so the prefix had to
  change for `SESSION_COOKIE_DOMAIN` to be usable at all. `__Secure-` is still
  browser-enforced to require `Secure`. The one-time OIDC transaction and
  registration receipt cookies remain `__Host-`; they are single-flow and never
  need cross-subdomain scope.

### Fixed

- Completing a merge no longer fails with a `NOT NULL` constraint violation on
  `user_profiles.reduced_motion` when neither account has ever opened profile
  settings. The merge built an explicit insert that bound `NULL` over the
  column's own SQL default; it now falls back to that default. This path was
  reachable in the new learner-initiated flow, where two freshly registered
  duplicate accounts can be merged before either has profile settings.

## [0.70.2] - 2026-07-30

### Fixed

- Browser OIDC ID-token validation now allows a bounded 60-second clock-skew
  tolerance when both nonce validation and fresh-authentication evidence are
  required. Bearer access-token validation remains strict.
- Tokens outside that bound, or with an invalid signature, issuer, audience,
  authorized party, nonce, or authentication time, continue to fail closed.

## [0.70.1] - 2026-07-30

### Fixed

- Cloudflare D1 migration checksums now use a line-ending-neutral LF contract
  while accepting equivalent legacy LF- and CRLF-bound ledger records without
  rewriting production history.
- Substantive migration changes remain fail-closed and checksum-bound byte for
  byte apart from line-ending normalization.

## [0.70.0] - 2026-07-30

### Added

- Privacy-safe signed-token diagnostics for accepting or rejecting the verified-email
  claim contract without recording identity values.
- A secure HTTPS Compose profile that proves the Learn-to-identity-to-API browser
  journey with API-owned `HttpOnly` sessions, trusted local TLS, backup and restore,
  deterministic configuration checks, and container vulnerability gates.
- Encrypted, authenticated continuation cursors for bounded owner account and audit
  administration queries.

### Changed

- Secure Compose validation consumes the redirect-safe Learn release and verifies
  sign-in, callback, session use, sign-out, and recovery from a clean browser.
- Release artifact upload and download steps use immutable Node 24-compatible GitHub
  Actions revisions.
- Secure backup checksum verification is portable across the supported Alpine-based
  utility images.

### Security

- Secure self-host images were rebuilt on remediated Caddy, curl, PostgreSQL, API,
  and browser-smoke bases and the release gate now rejects critical image
  vulnerabilities.
- Browser smoke and API containers run as non-root with constrained capabilities and
  an explicit browser seccomp profile.
- Administration cursors fail closed after tampering, secret rotation, or reuse
  across installations, query types, or account-state filters.

### Known limitations

- The self-host compatibility level remains `evaluation`.
- Real provider token claims and owner administration journeys still require
  deployment-specific validation before a hosted production promotion is accepted.
- Identity providers, email delivery, domains, secrets, and first-owner authority
  remain deployment-owner responsibilities.

## [0.69.0] - 2026-07-30

### Added

- Tenant-aware authorization boundaries with explicit owner, administrator, and
  learner enforcement.
- Versioned release-governance contracts for platform, content, migration,
  compatibility, checksum, and provenance artifacts.
- A credential-independent release rehearsal covering local publication, integrity
  verification, consumption, rollback, and cleanup.

### Changed

- Browser OIDC callbacks can recover safely after an expired browser transaction
  without weakening nonce, state, PKCE, or recent-authentication checks.
- PostgreSQL profile and learner-export timestamps use portable database semantics.

### Security

- Release workflows use immutable action references, least job permissions, Sigstore
  keyless signing, GitHub artifact attestations, and a validation-only manual path.

### Known limitations

- The self-host compatibility level remains `evaluation`.
- Identity-provider configuration and real user journeys remain deployment-owner
  responsibilities.

[0.71.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.71.0
[0.70.2]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.2
[0.70.1]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.1
[0.70.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.0
[0.69.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.69.0

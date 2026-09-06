# Project 42 platform v0.104.0

An adopter's own module now reaches their own site.

Content inheritance was proven in the content repository and rendering was proven on the site, and nothing joined the two. A generated content repository merged `upstream/` with `custom/` into `dist/catalog.json`; the generated site went on rendering `starterCatalog`, the canonical curriculum baked into this package at build time; and `content.customContentDir` was written into the front end's configuration and read by nothing. An adopter's module existed, merged correctly, passed the inheritance test -- and never appeared on their site.

## How the catalogue reaches the site

`project42-portal materialise` resolves it and installs two forms of one value: `lib/siteCatalog.generated.ts`, which the application imports, and `lib/siteCatalog.generated.json`, which the `.mjs` gates read because they cannot import TypeScript. Both are written in one call, so they cannot drift.

Resolution has exactly two outcomes:

- `content.customContentDir` declared -- that repository's `dist/catalog.json`.
- not declared -- this package's own catalogue.

There is no third. A declared content repository whose catalogue is missing, unparseable, empty or the wrong shape fails the install and names the command that fixes it. Falling back there would ship a site silently missing its operator's own content, which from outside is indistinguishable from a site that never had any.

`PROJECT42_CONTENT_DIR` overrides the configured path for CI, where `actions/checkout` cannot write above the workspace, and the scaffolded workflows check the sibling content repository out and build its catalogue before installing.

## materialise now prunes

It copied the front-end application onto a consumer and removed nothing, so a file this package deleted lived forever in every consumer: a dead route still exported, a retired gate still run, a component nothing imports. It now removes what it no longer ships, and decides per file from the consuming repository's own `.gitignore`, which already states who owns what under a materialised root. Ignored means build input. Tracked, or un-ignored, means a declared fork: left alone and named in the report. Outside a git repository it prunes nothing, because there is no way to tell an adopter's file from a stale one and guessing wrong deletes their work.

## Migrations

No file under `migrations/` was added or changed since v0.103.5.

## Breaking changes

A front-end repository that declares `content.customContentDir` must have built that repository's catalogue before it installs: `npm run content:sync && npm run content:build` there first. An install that cannot find it now fails instead of quietly rendering the canonical curriculum.

## Known limitations

Publishing a content change to a site is three commands, not one: `content:build` in the content repository, then `app:materialise` and `facts:generate` in the front end. The scaffolder and the content README say so, but nothing enforces the order beyond the `prebuild` gate failing.

A generated site's browser suite passes on `06-galactic-guide` and fails on `05-open-orbit` and `07-quiet-lantern`, which ship 5-7 KB of component CSS against Galactic's 19 KB and do not implement treatments the conformance suite asserts. Unchanged from v0.103.5, and Gallery-side.

## Rollback

Revert consuming sites to v0.103.5. A site that had installed a merged catalogue reverts to rendering the canonical one, so an adopter's own modules disappear from it until they re-pin.

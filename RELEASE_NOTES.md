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

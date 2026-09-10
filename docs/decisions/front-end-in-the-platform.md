# The Front End Lives in the Platform

**Last verified:** 2026-09-10

Why the rendering application moved out of the `project-42.dev` deployment repository and into `project42-platform/web`, why it is *installed* onto a front-end repository rather than imported as a library, and why a deployment's `app/` is now a git-ignored build output. Reconstructed in September 2026 from the commit record and the code; every claim below cites the commit or the file it comes from, and section 7 names what the record does not settle.

---

## 1. Context

Until 2026-09-06 the split was the wrong way round.

- The platform had no front end. Its `web/` directory held two files — a `PortalConfig` model whose theme was five colour strings (`primaryColor`, `accentColor`, `headerBackground`, `fontFamily`, `colorMode`), and a second learner-progress store keyed `project42_learner_progress_v1`. Neither was imported, exported, referenced by a script, a test, a workflow or a document anywhere in the repository (`3a2a7e3`).
- The entire rendering application lived in `project-42.dev` — the project owner's own deployment: every route, every component, the 158 KB design system, the theme and layout loaders, the Cloudflare Worker entry, the build toolchain, and the twenty gates that police them.
- Classified file by file, that deployment repository was roughly **90% product by authored weight** (`31361be`, in `project-42.dev`).
- Product code carried one deployment's values as literals. `AuthProvider` defaulted the account API to the owner's own account service, so an adopter who missed an environment variable pointed their learners at somebody else's; the sitemap, robots, subdomain links and the Pages exporter carried hostnames as constants; `themeBrand` statically imported six `theme.json` files by id, so only one theme set could build; and several gates asserted one theme id and one hostname literally, so an adopter's own values failed the gates meant to protect them. 51 `Project 42` literals were spread across 19 files (`d0b9e95`).

The stated consequence, in the commit that moved it: *"a product whose adopter path ends in 'a working front end' cannot keep the front end outside the product"* (`d0b9e95`).

## 2. Decision

1. **`project42-platform/web/` holds the rendering application.** 149 files moved: routes, components, the design system, the theme and layout loaders, the Worker entry, the build toolchain and the gates.
2. **A deployment repository is branding, configuration and release records, and nothing else.** In `project-42.dev` what remains is `project42.config.json`, `project42.copy.json`, `config/`, `public/brand/`, the hash-locked Gallery bundles, generated icon and diagram artifacts, `.github/`, the governance documents, its own changelog, the GitHub App token minter, and four acceptance tests that drive the live deployment (`31361be`).
3. **The front end is installed, not imported.** `project42-portal materialise` — run from the deployment's `postinstall` hook — copies `web/` onto the front-end repository's root.
4. **The materialised paths are git-ignored build inputs.** `/app/`, `/copy/`, `/lib/`, `/worker/`, most of `/scripts/` and `/tests/`, and the build configuration are listed in the deployment's ignore file.
5. **Materialise refuses to overwrite a git-tracked file.** Verified in `bin/project42-portal.mjs` on 2026-09-10: it collects the paths it is about to write, intersects them with the deployment's tracked files, and fails naming the collisions rather than clobbering them. Un-ignoring a path is therefore how a deliberate fork is declared — and a fork the deployer then owns and must maintain, because the install stops until they do.
6. **Instance values become configuration.** `portal.apiOrigin`, `portal.canonicalOrigin`, `portal.adminOrigin`, `organization.name`, and a theme-bundle module generated from the deployment's own `availableThemes`, replaced the literals listed in section 1.

## 3. Why installed rather than imported

This is the part most likely to look arbitrary later, so the reasoning is recorded verbatim from `d0b9e95`:

> A Next.js application needs its routes to be real files, its stylesheet resolvable by PostCSS, and its Playwright specs to see the same relative paths as the code they drive; none of that survives being vendored into `node_modules`.

An npm dependency cannot supply a file-system router, and a stylesheet inside a dependency tree is not on the PostCSS path the application's own config describes. So the product is distributed as a package and *expanded* onto the consumer, where every gate runs unchanged and every relative import of instance data still resolves.

The second-order consequence was found and fixed a day later (`01e164c`): a copy layer that never removes anything leaves a file the product deleted upstream alive forever in every consumer — a dead route still exported, a retired gate still run by `npm run check`. Materialise now prunes, and decides per file from the consumer's own ignore file: ignored means build input and may be removed; un-ignored or git-tracked means a declared fork and is left alone and named in the report. Outside a git repository it prunes nothing, because there is no way to tell an adopter's file from a stale one.

## 4. Why the platform does not build its own `web/`

Also recorded in `d0b9e95`:

> Adding React, Next and vinext to these dependencies would put them inside `audit:production` at moderate, and the front end would never be clean again.

The platform therefore asserts a **distribution contract** — `tests/web-distribution.test.mjs` — instead of building the application. The build, lint, typecheck, browser and link gates run in a consuming front-end repository, where the toolchain lives. This is a deliberate trade: the platform's production audit stays clean, and the cost is that a `web/` change is only fully proven once it is materialised into a consumer.

## 5. Consequences

| Consequence | Where it shows |
|---|---|
| A clean checkout of a deployment has no application until `postinstall` has run | `31361be` breaking-change note |
| Editing `app/` in a deployment silently disappears on the next install | the deployment's `AGENTS.md` rule 0 and README first section, rewritten in `31361be` for exactly this reason |
| A `web/` change must be released and then taken by the deployment | the `chore(platform): take …` commits in `project-42.dev` |
| Every user-visible sentence became overridable rather than forkable | `web/copy/`, one module per page, deep-merged with the deployment's `project42.copy.json` (`d0b9e95`) |
| The scaffolder writes two repositories, not one | `project42-portal create` emits a front end plus a content repository (`d0b9e95`) |
| An adopter's own module reaches their site | `01e164c` — before it, the merged catalogue was built correctly and rendered nowhere |
| `npm run portal:build` and the old static portal builder were removed | `d0b9e95` breaking-change note |

## 6. Evidence

| Commit | Repository | Date | Subject |
|---|---|---|---|
| `3a2a7e3` | project42-platform | 2026-09-06 | refactor(platform): retire the dead rival portal-config model |
| `d0b9e95` | project42-platform | 2026-09-06 | feat(platform): ship the front end, the adopter CLI, and a copy layer |
| `01e164c` | project42-platform | 2026-09-06 | feat(platform): render the adopter's own catalogue, and prune what the product drops |
| `31361be` | project-42.dev | 2026-09-06 | refactor: consume the front end from the platform instead of vendoring it |
| `06cb488` | project-42.dev | 2026-09-06 | chore(portal): delete 43 orphan files nothing reads |

State checked on 2026-09-10: `web/` holds 227 tracked files in this repository; `project-42.dev` tracks 145 files in total; the deployment's ignore file carries the ignore block and its own explanation of it; `bin/project42-portal.mjs` implements `create`, `materialise` and `doctor`.

Both migration commits were verified before landing: `d0b9e95` by materialising `web/` into `project-42.dev` and running its full 20-gate check green, and `31361be` by `npm run verify` against the published tag — the browser suite asserts exact on-screen text and passed without a single expectation being edited.

## 7. What this record does not establish

- **When the decision was taken, and by whom.** The commits state the reasoning at the moment of the change. No earlier design note, issue or decision record proposing the move was found in this repository or in `project-42.dev`, so this page cannot say whether it was argued out in advance or reached while classifying the boundary. Both migration commits describe classification work that preceded them.
- **Whether alternatives were compared.** Only the chosen shape and its constraints are written down. No record was found of an evaluated alternative — a git submodule, a template repository, a generator that emits a standalone site — being weighed and rejected. The dependency-tree route is argued against in `d0b9e95`; the others are simply absent from the record.
- **Whether 90% is a measurement or an estimate.** `31361be` says "roughly 90% product by authored weight" and says the classification was line by line. The classification output itself is not in the repository.

## Related

- [../architecture.md](../architecture.md) — the three-layer architecture this sits inside
- [../self-hosting/portal-and-theming.md](../self-hosting/portal-and-theming.md) — the adopter-facing procedure
- [three-layer-theming.md](three-layer-theming.md) — the appearance half of the same boundary
- [canonical-content.md](canonical-content.md) — the content half

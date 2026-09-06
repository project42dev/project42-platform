# Project 42 platform v0.104.1

The scaffold approved nothing.

A generated front end declared `allowScripts` keyed by the dependency spec — `"github:project42dev/project42-platform#v0.104.0": true`. npm matches that field by package **name**, so the entry covered nothing at all, and every install of a scaffolded repository printed

```
npm warn allow-scripts   @project42/platform@0.104.0 (prepare: npm run build)
```

That prepare script is what compiles `dist/`, which is the whole front end. npm 11.16 warns and runs it anyway, so the defect was invisible. The day npm enforces instead of warning, an install would produce a package with no `dist/` and the adopter's first build would fail at its first import — the failure this scaffold exists to prevent.

Found by walking the adopter path from nothing rather than by reading it.

The scaffold now approves by name: `@project42/platform`, plus `esbuild`, `workerd`, `unrs-resolver` and `sharp`, which fetch or compile their platform binaries in the same phase and which the build needs. `puppeteer` stays denied. `tests/web-distribution.test.mjs` asserts both halves — that each is approved, and that no key is a dependency spec.

## Migrations

No file under `migrations/` was added or changed since v0.104.0.

## Breaking changes

None.

## Known limitations

Unchanged from v0.104.0: publishing a content change to a site is three commands, and a generated site's browser suite passes on `06-galactic-guide` but not on `05-open-orbit` or `07-quiet-lantern`.

## Rollback

Revert consuming sites to v0.104.0. The scaffold is the only thing that changed, so an already-generated repository can instead fix its own `allowScripts` keys in place.

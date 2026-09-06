# {{ORGANIZATION}} curriculum

This repository holds the curriculum {{ORGANIZATION}}'s front end serves. It
**inherits** the Project 42 canonical curriculum and layers this organisation's
own material on top of it.

## The boundary

| Directory | Owner | What happens on an upstream update |
| --- | --- | --- |
| `upstream/` | `project42dev/project42-content` | Replaced wholesale, then hash-locked in `config/content.lock.json`. Never edit it — the check rejects a hand-edit. |
| `custom/` | You | Untouched. A sync does not read it, write it, or delete it. |
| `dist/` | Derived | Rebuilt from the two above. Git-ignored. |

That directory boundary *is* the inheritance model. A local module cannot be
lost to an upstream update because no sync touches the place local modules live.
`tests/inheritance.test.mjs` asserts exactly that across two upstream
generations.

## Working with it

```bash
npm install
npm run content:sync -- --source ../project42-content   # install / update upstream
npm run content:build                                   # merge into dist/catalog.json
npm run verify                                          # lock check + build + tests
```

`npm run content:check` verifies the installed `upstream/` tree against the lock
without touching the network, so it is safe in CI where the upstream repository
is not checked out.

## Adding your own material

Put a module at `custom/modules/<id>.json` and a resource at
`custom/resources/<id>.json`, then declare how it joins the catalogue in
`custom/catalog.json`.

```json
{
  "contentVersion": "0.2.0",
  "paths": [{ "id": "ai-foundations", "moduleIds": ["house-style"] }],
  "modules": [],
  "resources": [],
  "providers": []
}
```

Collision rules, applied by `mergeCatalogs` from `@project42/platform`:

- **path** — merged. An inherited path keeps its upstream title and summary
  unless you override them, and its `moduleIds` become the union of both. That
  is what makes the three lines above enough to add one lesson to an inherited
  path.
- **module** and **resource** — replaced. Yours wins outright, so overriding an
  inherited lesson means publishing a module with the same id.
- **provider** — added only if the id is new; upstream's entry is kept.
- Anything with an id upstream has never seen is simply added.

## Versioning

`dist/catalog.json` declares `custom/catalog.json`'s `contentVersion` as its
own, because a consumer pinning this repository is pinning what *you* publish.
The inherited version and the exact upstream commit are recorded beside it under
`inheritedFrom`, so provenance survives the merge.

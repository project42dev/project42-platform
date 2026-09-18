# Enterprise layout and Warm Campus default

The platform ships four independent layouts: Standard, Compact, Wide and
Enterprise. Choose a deployment default through `layout.defaultPreset`; visitors
can select a layout in the account menu without changing the deployment's theme.

```json
{ "theme": "portal-default", "layout": { "defaultPreset": "enterprise" } }
```

Enterprise provides a persistent 224px navigation rail on desktop, measured
content columns, smaller heading ramps and comfortable card spacing. Below
1100px it returns to the shared header composition; the existing mobile menu
continues to operate. It positions existing content and navigation, and does
not insert dashboard samples, courses, statistics or learner records.

The platform-owned `portal-default` theme now uses the Warm Campus palette:
warm paper surfaces and restrained burgundy actions, retaining the same system
typeface and component structure. It does not select Enterprise or change
content, geometry or layout preferences. Standard remains the deployment
default unless configured otherwise.

Canonical layout files live under `web/layouts/`. Generate stylesheets with
`node web/scripts/build-layouts.mjs`. Each manifest declares the full composition
token set; an optional `composition` stylesheet can position existing elements
under its own `data-layout` scope. It must not declare colors, typefaces or
generated content. `--check` catches stylesheet drift in the platform's web gate.

Gallery copies of platform layouts are derived snapshots and must be synced from
the released platform rather than edited independently. An adopter with a
repository-owned theme/layout folder still has precedence over a shipped bundle.
Update that override deliberately if it should follow the platform default.

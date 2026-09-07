# Project 42 Platform Architecture

## Executive Overview: The Decoupled 3-Layer Architecture

Project 42 separates curriculum intelligence, content storage, and presentation into three decoupled layers:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. THE CONTENT FACTORY (Orchard)                                       │
│    • Autonomous AI discovery & currency maintenance                    │
│    • Human Gate 1 (scope/spend) & Gate 2 (evidence diff)               │
│    • OUTPUT: Git commits & PRs dropped into content repo               │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Pure JSON / Markdown / Mermaid
┌────────────────────────────────────▼───────────────────────────────────┐
│ 2. THE CANONICAL CONTENT REPO (project42-content)                      │
│    • Raw, host-agnostic, schema-validated curriculum data              │
│    • Versioned releases (e.g. v0.86.0)                                 │
│    • Contains NO frontend code, build scripts, or hosting bias         │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ Upstream Sync (Git / npm / CLI)
┌────────────────────────────────────▼───────────────────────────────────┐
│ 3. THE CONSUMER PLATFORMS & PORTALS                                    │
│    ┌─────────────────────────────────────────────────────────────┐     │
│    │ A. UNIFIED WEB PORTAL (project-42.dev / learn)              │     │
│    │    • Single-origin routing: /, /learn/*, /guide/*, /profile │     │
│    │    • Declarative config (project42.config.json)             │     │
│    │    • Zero session drops, single auth state, tokenized CSS   │     │
│    └─────────────────────────────────────────────────────────────┘     │
│    ┌─────────────────────────────┐ ┌─────────────────────────────┐     │
│    │ B. STANDALONE THEME GALLERY │ │ C. STANDALONE ADMIN PORTAL  │     │
│    │    • gallery.project-42.dev │ │    • admin.project-42.dev   │     │
│    │    • Design system sandbox  │ │    • RBAC owner & domain ops│     │
│    │    • 100% public, no auth   │ │    • Fixed dark console UI  │     │
│    └─────────────────────────────┘ └─────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Principles

1. **The "Content Drop" Boundary**:
   - Upstream maintenance (Orchard) is strictly responsible for researching, drafting, and dropping validated JSON/Markdown content into the content repository. It is operated by the project owner, is not part of the open-source product, and its internals are not documented in this repository. The method it follows, and the human approval gates every item passes through, are described in [how the curriculum stays current](how-content-stays-current.md).
   - Downstream presentation engines are responsible for layout, routing, theming, and hosting.

2. **Unified Single-Origin Web Experience**:
   - The primary consumer portal operates on a single origin, providing unified navigation across landing, learning paths (`/learn`), field guide references (`/guide`), and learner profile (`/profile`).
   - Eliminates cross-subdomain authentication drops and avoids brittle iframe/postMessage bridges.

3. **Declarative Hugo/Jekyll-Style Theming**:
   - The product **ships no theme**, exactly as a static-site generator ships none. Themes live in the Gallery or in the deploying repository, never in the package. A product that bundles a theme makes every install wear whichever look it happened to bundle, so "the default look" and one operator's brand become the same thing. Layout bundles are a different contract and the platform does still ship those.
   - A theme is a **folder**. A deployer downloads one, drops it in at `themes/<id>/` in their own repository, and names it in the single `"theme"` key of `project42.config.json`. Nothing else changes — not the code, not a build script, not a manifest, not a lock entry. Resolution order: the site's own folder, then a bundle it already vendors under `public/themes/` (git-tracked, or recorded in the bundle lock). There is no third rule — a name nothing provides fails the install and says which folder to create.
   - The Gallery is where a look comes **from**. Pulling from it is hash-locked; dropping a downloaded folder in by hand is equally valid and needs no lock.
   - Layout is independently selected by bundle ID. Theme and layout bundles may change presentation only; content, behavior, routing, authentication, and learner-data contracts remain core-owned.
   - Core CSS owns structure and consumes tokens; it declares no brand. `npm run theme:boundary` fails the build on a colour literal, an accent used as text, a typeface named inline, a token pinned outside the fallback layer, or a new hardcoded radius or tracking value.
   - The full division of ownership — what core owns, what a theme owns, and what a theme is guaranteed to be able to change — is [the appearance contract](appearance-contract.md).

4. **Dedicated Standalone Portals**:
   - **Theme Gallery (`gallery.project-42.dev`)**: Completely independent, static catalog of complete theme bundles with isolated preview sandboxes. It is the editing and publishing source for manifests, tokens, component treatments, marks, hero artwork, and badges. Zero auth or learner profile overhead.
   - **Admin Console (`admin.project-42.dev`)**: Role-gated management portal for tenant administrators and domain owners, running a fixed high-contrast dark theme.

5. **Universal Host-Agnostic Compatibility & Air-Gapped Operation**:
   - The platform builds cleanly for Cloudflare Workers, Node.js, Docker Compose, or static GitHub Pages with zero external CDN dependencies.

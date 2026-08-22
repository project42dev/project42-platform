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
│ 3. THE CONSUMER PLATFORMS (project42-platform & Customer Deployments)  │
│    • Host-Agnostic Static Generator (Cloudflare, Azure, GitLab, S3)    │
│    • Reads content/ folder + optional custom/ corporate overlay        │
│    • Configurable themes (logo, colors, corporate styling)             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Principles

1. **The "Content Drop" Boundary**:
   - Upstream maintenance (Orchard) is strictly responsible for researching, drafting, and dropping validated JSON/Markdown content into the content repository.
   - Downstream presentation engines are responsible for layout, routing, theming, and hosting.

2. **Universal Host-Agnostic Compatibility**:
   - The platform compiles into a static HTML/JS/CSS artifact that can be hosted on any static cloud or on-prem web server.

3. **Corporate Theming & Custom Content Overlays**:
   - Organizations can mount proprietary internal courses (`custom-content/`) alongside the open-source catalog.

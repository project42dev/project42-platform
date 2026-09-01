# White-Label Portal Theming & Customization Guide

This runbook guides operators on how to brand, customize, and operate the Project 42 Open-Source Web Portal for their own organization or enterprise.

---

## 1. Quick Start Configuration

Project 42 reads its global theme and layout configuration directly from `project42.config.json` at the root of the portal repository (operating like a Hugo or Jekyll declarative theme engine).

Create `project42.config.json` from the provided template:

```bash
cp project42.config.example.json project42.config.json
```

### Example `project42.config.json`

```json
{
  "$schema": "https://schema.project-42.dev/v1/portal-config.json",
  "theme": "06-galactic-guide",
  "availableThemes": [
    "06-galactic-guide",
    "01-cosmic-answer",
    "02-learning-portal",
    "03-model-constellation",
    "04-field-signal",
    "05-open-orbit"
  ],
  "portal": {
    "canonicalOrigin": "https://learn.acme.example",
    "adminOrigin": "https://admin.acme.example",
    "legacyOrigins": []
  },
  "organization": {
    "name": "Acme AI Academy",
    "tagline": "Evidence-based AI learning",
    "supportUrl": "https://helpdesk.acme.example"
  },
  "layout": {
    "defaultPreset": "standard"
  },
  "features": {
    "enableFieldGuide": true,
    "enableVisualGuides": true,
    "enableKnowledgeChecks": true,
    "enableBadges": true,
    "enableTranscripts": true
  }
}
```

---

## 2. Theme and core boundary

The platform core owns behavior, content contracts, routing, authentication,
learner data, accessibility semantics, and stable component hooks. It does not
contain named customer-theme selectors or theme artwork.

The Gallery owns complete versioned theme bundles. A bundle contains its
manifest, tokens, component treatments, mark, hero artwork, and badges. The
portal installs a bundle from the Gallery, records the exact source revision and
file hashes, and loads it through generic theme hooks. The favicon and every
browser-size alias are derived from the selected bundle's authoritative mark;
they are not configured as unrelated organization assets.

Changing only the `theme` value selects a different installed bundle. Theme
installation or editing happens in the Gallery first, followed by the portal's
sync/install process. Never copy a theme's CSS into platform core or edit page
content to make a theme fit.

## 3. Layout bundles

`layout.defaultPreset` is an installed layout bundle ID. The reference portal
ships `standard`, `wide`, and `compact`, but customer layouts use the same
declarative contract. Layout bundles control structure, density, and responsive
arrangement through stable hooks; they do not replace behavior, content,
routing, or authentication.

---

## 4. Adding Internal / Proprietary Courses

You can overlay proprietary corporate courses and modules alongside the open-source curriculum without modifying core files:

1. Place your course JSON definitions in `custom-content/modules/`.
2. Run the build script:
   ```bash
   npm run build
   ```
3. The generator automatically validates your custom modules against the JSON schema and compiles them into `dist/portal/`.

---

## 5. Running Turnkey with Docker Compose

To deploy the entire portal stack (NGINX Web Portal + PostgreSQL + Keycloak + Platform API):

```bash
cd self-host
docker compose up -d
```

- **Web Portal**: `http://localhost:3000`
- **Platform API**: `http://localhost:8787`
- **Identity & SSO (Keycloak)**: `http://localhost:8080`

---

## 6. Air-Gapped Intranet Deployments

## 7. Portal boundaries

The selected theme applies only to the public portal. Gallery uses a neutral
fixed shell and renders theme packages in isolated previews. Admin uses its
fixed high-contrast operational theme and ignores learner preferences. Keep
learner navigation relative to the canonical public origin; use absolute links
only when crossing to Gallery, Admin, source repositories, or support systems.

Project 42 is engineered with **zero external CDN dependencies**:
- **Offline Fonts**: Uses embedded system font stacks.
- **Embedded SVG Icons**: All icons are bundled into HTML templates.
- **Bundled Diagrams**: Visual architecture guides run offline with local renderers.
- **Local Progress**: Operates in zero-config mode storing learner progress in browser `localStorage`.

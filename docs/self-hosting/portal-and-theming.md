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
  "branding": {
    "organizationName": "Acme Global Corp",
    "portalTitle": "Acme AI Academy",
    "portalTagline": "Mastering Agentic AI, MCP Tooling & Modern Cloud Architectures",
    "logoUrl": "/brand/project-42-mark.svg",
    "copyright": "© 2026 Acme Global Corp. All rights reserved.",
    "supportUrl": "https://helpdesk.acme.corp"
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

## 2. Layout Density Presets

Project 42 provides three core responsive layout presets:
- **Standard Shell (`standard`)**: Balanced 1180px maximum line length for optimal readability.
- **Wide Canvas (`wide`)**: Expansive 1560px container width for high-density administrative dashboards and multi-column comparison matrices.
- **Compact Minimal (`compact`)**: Streamlined 960px container for narrow-width reading focus.

---

## 3. Adding Internal / Proprietary Courses

You can overlay proprietary corporate courses and modules alongside the open-source curriculum without modifying core files:

1. Place your course JSON definitions in `custom-content/modules/`.
2. Run the build script:
   ```bash
   npm run build
   ```
3. The generator automatically validates your custom modules against the JSON schema and compiles them into `dist/portal/`.

---

## 3. Running Turnkey with Docker Compose

To deploy the entire portal stack (NGINX Web Portal + PostgreSQL + Keycloak + Platform API):

```bash
cd self-host
docker compose up -d
```

- **Web Portal**: `http://localhost:3000`
- **Platform API**: `http://localhost:8787`
- **Identity & SSO (Keycloak)**: `http://localhost:8080`

---

## 4. Air-Gapped Intranet Deployments

Project 42 is engineered with **zero external CDN dependencies**:
- **Offline Fonts**: Uses embedded system font stacks.
- **Embedded SVG Icons**: All icons are bundled into HTML templates.
- **Bundled Diagrams**: Visual architecture guides run offline with local renderers.
- **Local Progress**: Operates in zero-config mode storing learner progress in browser `localStorage`.

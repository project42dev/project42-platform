# Getting started

Project 42 Platform supplies the validated curriculum, account API, and
self-hosting contracts used by the unified learning and reference portal.

## Scaffold a front end

Prerequisites are Node.js 22 and npm.

```bash
npm ci
npx project42-portal create "Your Academy"
```

That produces a front-end repository and a content repository beside each other,
with content inheritance already wired. Build the front end:

```bash
cd your-academy
npm install                                   # installs and materialises the app
npm run themes:sync -- --source ../project42-gallery
npm run bootstrap
npm run build
npm run pages:build && npm run pages:serve
```

Browser-local progress works without an API. Cloud progress, account management,
and Admin require the API and identity services described in the self-host
profile. `npm run doctor` reports anything a front-end repository is missing.

## Configure the deployment

`project42.config.json` is the declarative source of truth. Set:

- `theme` to a theme bundle THIS repository provides — a folder you dropped in
  at `themes/<id>/`, or one already vendored at `public/themes/<id>/`. The
  platform ships no theme, so a name nothing provides fails the install and
  tells you which folder to create;
- `layout.defaultPreset` to one installed layout bundle, such as `standard`;
- `portal.canonicalOrigin` to the one public learner origin;
- `portal.adminOrigin` to the separately protected Admin origin; and
- organization name, tagline, and support link. The selected theme bundle owns
  its mark, favicon source, hero artwork, badges, tokens, and component treatments.

Validate configuration before packaging:

```bash
npm run check          # in this repository
npm run verify         # in the front-end repository
```

See [Portal and theming](self-hosting/portal-and-theming.md) for the complete
contract.

## Run the service profile

```bash
cd self-host
docker compose up -d
```

The reference profile starts the portal on port 3000, the API on 8787, Keycloak
on 8080, and PostgreSQL for durable account and learner records. Replace all
development credentials and configure exact origins before exposing it.

## Production boundaries

- Serve `/`, `/learn/**`, `/guide/**`, `/profile`, and public information
  routes from one origin.
- Redirect legacy learner and Guide hosts to that origin while preserving paths,
  query strings, and fragments.
- Deploy Gallery independently with no authentication.
- Deploy Admin independently, require an `admin` or `owner` role, and retain
  its fixed high-contrast operational theme.
- Use host-only secure session cookies for the public origin. Do not store bearer
  tokens or trusted account state in browser storage.

Continue with [Architecture](architecture.md), [Browser sessions](browser-sessions.md),
and [Universal hosting](self-hosting/universal-hosting-deployment.md).

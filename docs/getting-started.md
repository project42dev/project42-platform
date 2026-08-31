# Getting started

Project 42 Platform supplies the validated curriculum, account API, and
self-hosting contracts used by the unified learning and reference portal.

## Preview the static portal

Prerequisites are Node.js 22 and npm.

```bash
npm ci
cp project42.config.example.json project42.config.json
npm run portal:build
npx serve dist/portal
```

The generated site is a static preview. Browser-local progress works without an
API. Cloud progress, account management, and Admin require the API and identity
services described in the self-host profile.

## Configure the deployment

`project42.config.json` is the declarative source of truth. Set:

- `theme` to one installed theme bundle, such as `06-galactic-guide`;
- `layout.defaultPreset` to `standard`, `wide`, or `compact`;
- `portal.canonicalOrigin` to the one public learner origin;
- `portal.adminOrigin` to the separately protected Admin origin; and
- organization identity and support links.

Validate configuration before packaging:

```bash
npm run test
npm run portal:build
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

# Getting started

Project 42 supplies the reusable web application, account API and deployment
contracts. Published curriculum is maintained in the separate
[content repository](https://github.com/project42dev/project42-content).

## Scaffold and build a site

Prerequisites: Git, Node.js 22.18 or later, and npm. Use a released platform tag
for a reproducible deployment; the default branch may contain unreleased work.

```bash
git clone https://github.com/project42dev/project42-platform.git
cd project42-platform
npm ci
npm run build
node bin/project42-portal.mjs create "Your Academy" --dir ..

cd ../your-academy-content
npm install
npm run content:sync
npm run content:build

cd ../your-academy
npm install
npm run bootstrap
npm run pages:build
npm run pages:serve
```

The content build must precede the site's install: materialisation reads the
merged catalogue from the adjacent content repository. The scaffold prints these
paths. The platform supplies `portal-default`; no Gallery checkout or theme sync
is needed for a first build. `npm run doctor` checks the materialised site.

Browsing public material does not require an account. Participation and durable
progress require a configured account service and an approved learner account;
the former browser-only record and transfer flow are retired.

## Configure the deployment

Edit the site's `project42.config.json`:

- `theme` selects an installed theme; `availableThemes` lists offered bundles.
- `layout.defaultPreset` selects Standard, Compact, Wide or Enterprise by its
  lowercase ID. Layout is independent of theme.
- `portal.canonicalOrigin` identifies the public learner origin.
- `portal.adminOrigin` identifies the separately protected Admin origin.
- `portal.apiOrigin` identifies the account API. An explicitly set
  `NEXT_PUBLIC_PROJECT42_API_ORIGIN` overrides it at build time.
- `organization` supplies the name, tagline and support link. Artwork and
  appearance tokens come from the selected theme bundle.

Custom theme sources belong in the site's `themes/<id>/`; installed assets
belong in its `public/themes/<id>/`. Only the default theme belongs in the
platform. Follow [the theming guide](self-hosting/portal-and-theming.md) for
custom bundles, Gallery sync and rebuilding derived brand assets.

Run `npm run verify` in the site before publishing. Platform maintainers run
`npm run check` in the platform repository.

## Add identity and durable records

The [Docker Compose guide](self-hosting/docker-compose.md) documents two distinct
profiles: a local HTTP API evaluation stack and an HTTPS browser-session stack.
The basic profile starts the API, PostgreSQL and Keycloak. Its web service is
opt-in and needs a scaffolded front-end build context. It does not automatically
launch a complete browser-ready portal. Use the documented HTTPS profile for
browser sign-in; replace sample credentials and configure exact origins.

There is no `npm run self-host` command. Follow the Compose guide's explicit
configuration, startup, health, backup and shutdown commands.

## Deployment boundaries

Serve public learning, reference, profile and information routes on one origin.
Keep Gallery public and independent, and Admin separately protected by role.
Use host-only secure session cookies; never put provider tokens in browser
storage. Disconnected operation requires staging packages, container images,
curriculum and media, and using an identity provider reachable by the deployment.

Continue with [Architecture](architecture.md), [Browser sessions](browser-sessions.md),
[Universal hosting](self-hosting/universal-hosting-deployment.md) and
[Enterprise layout](enterprise-layout.md).

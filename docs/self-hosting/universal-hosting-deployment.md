# Universal hosting and deployment

Project 42 separates the public portal, Gallery, Admin, API, identity provider,
and durable record store. A static host can serve the public UI, but authenticated
cloud progress and administration require the API and identity services.

## Scope of this document, and what is missing

This page covers **running the stack**. It does not cover **becoming an
adopter**, and as of 2026-09-05 nothing else does either.

The intended adopter path is: clone or run something from this repository and
receive two things — a working front end on the host of your choice, and your
own content repository configured to stay current from
`project42dev/project42-content`. Your content repository then feeds your front
end by the same three vectors documented in
[`../content-synchronization.md`](../content-synchronization.md), so an upstream
curriculum update reaches your site the way it reaches ours.

**That mechanism does not exist yet.** There is no scaffolding script in this
repository, and no template for the front-end or content repositories it would
produce. Until it does, an adopter has to assemble those by hand from the
sections below, and keep their content current themselves.

This section exists so the gap is recorded rather than discovered.

## Required host map

| Surface | Requirement |
|---|---|
| Public portal | One canonical origin for `/`, `/learn/**`, `/guide/**`, profile, and information routes |
| Legacy public hosts | Permanent or client fallback redirects that preserve path, query, and fragment |
| Gallery | Separate public static origin; no authentication or learner state |
| Admin | Separate origin; API-enforced `admin` or `owner` authorization; fixed operational theme |
| API | HTTPS, exact-origin CORS, secure cookie and CSRF enforcement |

## Static export

```bash
npm ci
npm run portal:build
```

Publish `dist/portal` to a static host. Configure a fallback only for routes
the generated artifact owns; do not rewrite missing assets to HTML. Generate
real files or redirect documents for deep links when the host does not provide
application rewrites.

Cloudflare Pages, Azure Static Web Apps, GitHub Pages, S3 plus CloudFront, and
NGINX are suitable when they preserve HTTPS, MIME types, cache controls, and
deep-link behavior.

## Docker Compose

```bash
cd self-host
docker compose up -d
docker compose ps
```

Use the Compose profile for evaluation and as a self-host reference. Before
production, replace development secrets, pin images, configure backups, set
exact canonical/API origins, provision TLS, and run the migration and recovery
gates.

## NGINX example

```dockerfile
FROM nginx:alpine
COPY dist/portal /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

For multiple origins, use separate virtual hosts or deployments. Never publish
Admin files under the public origin, and never allow Gallery configuration to
load authenticated account state.

## Verification

Verify `/`, `/learn`, `/guide`, `/profile`, representative dynamic routes,
assets, redirects, canonical metadata, and the selected theme. Confirm the
installed theme lock records the intended Gallery revision and hashes, and that
the configured layout bundle exists. Confirm Gallery
works while signed out and Admin fails closed for signed-out, learner, pending,
rejected, suspended, and revoked accounts.

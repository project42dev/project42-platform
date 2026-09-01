# Universal hosting and deployment

Project 42 separates the public portal, Gallery, Admin, API, identity provider,
and durable record store. A static host can serve the public UI, but authenticated
cloud progress and administration require the API and identity services.

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

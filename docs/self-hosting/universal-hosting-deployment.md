# Universal hosting and deployment

Project 42 separates the public portal, Gallery, Admin, API, identity provider,
and durable record store. A static host can serve the public UI, but authenticated
cloud progress and administration require the API and identity services.

## Adopter setup

The adopter CLI now creates both the front-end and its adjacent content
repository. Follow [getting started](../getting-started.md) to build content
before installing the front end. Shared application files are materialised
from the platform release; the site owns configuration and branding.

## Required host map

| Surface | Requirement |
|---|---|
| Public portal | One canonical origin for `/`, `/learn/**`, `/guide/**`, profile, and information routes |
| Legacy public hosts | Permanent or client fallback redirects that preserve path, query, and fragment |
| Gallery | Separate public static origin; no authentication or learner state |
| Admin | Separate origin; API-enforced `admin` or `owner` authorization; fixed operational theme |
| API | HTTPS, exact-origin CORS, secure cookie and CSRF enforcement |

## Static export

Run these in the front-end repository `project42-portal create` produced, not
in the platform repository:

```bash
npm ci
npm run pages:build
```

Publish `dist/pages` to a static host. Configure a fallback only for routes
the generated artifact owns; do not rewrite missing assets to HTML. Generate
real files or redirect documents for deep links when the host does not provide
application rewrites.

Cloudflare Pages, Azure Static Web Apps, GitHub Pages, S3 plus CloudFront, and
NGINX are suitable when they preserve HTTPS, MIME types, cache controls, and
deep-link behavior.

## Docker Compose

```bash
cp self-host/.env.example self-host/.env
# Configure secrets and origins first.
docker compose --env-file self-host/.env -f self-host/compose.yaml up --build -d
docker compose --env-file self-host/.env -f self-host/compose.yaml ps
```

The basic profile starts API, PostgreSQL and Keycloak. The web service is opt-in and builds from a separate front-end checkout. Follow [the Compose runbook](docker-compose.md) for that profile and HTTPS setup. Before
production, replace development secrets, pin images, configure backups, set
exact canonical/API origins, provision TLS, and run the migration and recovery
gates.

## NGINX example

```dockerfile
FROM nginx:alpine
COPY dist/pages /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

For multiple origins, use separate virtual hosts or deployments. Never publish
Admin files under the public origin, and never allow Gallery configuration to
load authenticated account state.

## Verification

Verify `/`, `/learn`, `/guide`, `/profile`, representative dynamic routes,
assets, redirects, canonical metadata, and the selected theme. Confirm the
installed Gallery lock, if used, records the intended revision and hashes, and that
the configured layout bundle exists. Confirm Gallery
works while signed out and Admin fails closed for signed-out, learner, pending,
rejected, suspended, and revoked accounts.

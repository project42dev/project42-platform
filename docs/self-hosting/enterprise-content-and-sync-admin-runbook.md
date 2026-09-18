# Enterprise content and synchronization

Reviewed 2026-09-18 against the adopter CLI and content/front-end templates.

The platform separates shared software, canonical public curriculum and an adopter's private content. A content update is a build and deployment input. The reference API does not provide the previously documented automatic live Git-to-PostgreSQL curriculum ingestion.

## Create the two repositories

Follow [getting started](../getting-started.md) to create the front-end and adjacent content repository. The scaffold connects the front end's `content.customContentDir` to the built content output.

In the generated content repository:

```bash
npm install
npm run content:sync
npm run content:build
```

The sync script refreshes inherited upstream material. Author private overlays under `custom/` using the generated catalog and module examples; validate the complete schema rather than copying a partial module definition from an old runbook.

## Apply a reviewed content update

1. Review the upstream revision and resulting content diff.
2. Run content synchronization and build in the adopter content repository.
3. Run `npm run app:materialise` in the front-end repository.
4. Regenerate affected facts, diagrams and other assets through the documented site scripts.
5. Run `npm run verify`, build the deployment artifact and publish it through your release process.
6. Keep the previous source revision and deployment artifact for rollback.

Automation may propose or execute those steps within the operator's release policy. A nightly `git pull` or `docker compose exec api npm run content:sync` alone does not update a prebuilt public portal.

## Private and disconnected deployments

Keep proprietary modules in a private content repository and restrict the resulting site according to your organization. A static artifact contains its published curriculum; an authenticated API does not hide public static course files.

Durable learner records require identity and the protected API/store. For an air-gapped installation, stage content, dependencies, images and media through an approved transfer path; then build and validate without external connectivity. Do not claim air-gapped operation while relying on live GitHub pulls or remote identity.

See [content synchronization](../content-synchronization.md), [portal configuration](portal-and-theming.md), [Compose](docker-compose.md) and [update channels](update-channels.md).

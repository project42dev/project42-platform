# {{ORGANIZATION}} 0.1.0

The first release of this deployment. It packages the site as a versioned
static archive with a strict artifact manifest, checksums, and build
provenance.

Replace this file each release. `npm run release:validate` requires the title
to name the version in `package.json` and every section below to be non-empty,
so a release cannot be cut with the previous release's notes still in place.

## Breaking changes

None. This is the first release.

## Migrations

No data or configuration migration is required.

## Known limitations

The release archive contains the public static site only. Hosted account and
learner-record services are versioned and operated separately. Curriculum comes
from the content repository scaffolded beside this one and is versioned there.

## Rollback

Redeploy the preceding known-good Pages artifact, or restore the prior tagged
static archive. No learner data is modified by a site release.

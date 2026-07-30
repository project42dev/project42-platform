# Support

Project 42 is an open-source learning platform. Community support covers the reusable
platform, published schemas, seed content, release artifacts, and documented reference
deployments. It does not include private hosted-service administration or a service
level agreement.

## Supported versions

The latest published minor release receives defect and security fixes. The immediately
preceding minor release receives security fixes when a safe patch is practical.
Older releases, untagged commits, forks, custom overlays, and modified images are
community-supported.

Each release's compatibility manifest is authoritative for the supported Node,
database, identity, API, Learn, migration, and image contracts. Administrators should
test an update in a non-production environment and retain a verified backup and the
previous signed release before approval.

## Where to get help

- Use GitHub Discussions for installation, authoring, and usage questions.
- Open a GitHub issue for a reproducible defect or documentation gap. Include the
  platform version, deployment mode, sanitized logs, reproduction steps, expected
  behavior, and actual behavior.
- Propose a focused pull request by following [CONTRIBUTING.md](CONTRIBUTING.md).
- Follow [SECURITY.md](SECURITY.md) for vulnerabilities. Never disclose a
  vulnerability, credential, personal information, or learner record in a public
  issue.

Hosted Project 42 account approvals, domain policy, owner actions, and learner-data
requests are handled through the hosted application's account and administration
surfaces, not through the public repository.

## Response expectations

Maintainers triage community reports as capacity allows. Acknowledgement, resolution,
backport, or release timing is not guaranteed. Security reports use the private
security process. Well-scoped reports with a minimal reproduction and a proposed test
are easier to investigate.

Support cannot recover custom configuration, secrets, branding, overlays, or learner
records. Self-hosting administrators are responsible for backups, restore rehearsals,
identity-provider continuity, monitoring, and local incident response.

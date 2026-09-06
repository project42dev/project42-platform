# Security policy

## Report a vulnerability privately

Do not open a public issue or pull request for a suspected vulnerability. Use
[GitHub private vulnerability reporting](https://example.org/{{NAME}}/security/advisories/new).

Include:

- the affected deployed version, route, or commit;
- the security impact and the preconditions required to reach it;
- minimal, sanitized reproduction steps;
- whether the issue is already being exploited; and
- a suggested mitigation when one is known.

Never include real credentials, session values, signed URLs, tenant or resource
identifiers, learner records, personal information, private logs, or production
data. Use clearly synthetic placeholders, and remove response bodies that could
contain user information.

## Supported boundary

Security fixes target the current production deployment at <{{ORIGIN}}> and the
latest commit on the default branch. Older commits, forks, and modified
deployments may need to update before a fix can be applied. Compatibility and
deprecation policy is in [SUPPORT.md](SUPPORT.md).

The front end is a static artifact served from the origin above. Identity,
accounts, and durable learner records are separate protected services; a report
affecting those services should still begin through private vulnerability
reporting so that it can be routed without public disclosure.

## Dependency and disclosure handling

The complete locked dependency graph is part of the release security boundary.
`npm run verify` audits production and development dependencies, and a release
may not ship with an unreviewed advisory against that graph. Platform
dependencies are pinned to a reviewed release and resolved to an exact commit
by the lockfile.

Maintainers will validate the report, coordinate remediation, and publish an
advisory when disclosure is safe. {{ORGANIZATION}} does not promise a fixed
response time, but reports involving active exploitation or learner data
receive the highest priority.

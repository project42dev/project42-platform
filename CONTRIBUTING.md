# Contributing

Project 42 welcomes corrections, new learning material, assessment improvements, and
platform changes. Contributions must preserve the reusable, provider-neutral core and
must not disclose hosted Project 42 operational information.

## Development workflow

1. Open an issue before adding a content type, provider integration, public API,
   migration, or top-level directory.
2. Branch from the current default branch and keep each pull request focused on one
   independently reviewable outcome.
3. Add or update automated tests for behavior, schema, workflow, and release-contract
   changes.
4. Run the repository gates:

   ```bash
   npm ci
   npm run check
   npm run api:check
   npm run release:check
   ```

5. Explain compatibility, migration, accessibility, privacy, and rollback effects in
   the pull request. A public contract change also requires a changelog entry.
6. Use a conventional commit subject and include the applicable `AB#<id>` when the
   contribution is associated with the Project 42 Azure DevOps backlog.

Maintainers merge reviewed pull requests. Direct commits to protected branches are not
part of the supported workflow.

## Content and evidence requirements

- Use primary sources for volatile product, model, or provider claims.
- Include `lastVerified`, `sources`, and a responsible content owner.
- Keep core concepts provider-neutral; describe provider-specific behavior explicitly.
- Write accessible lesson text, meaningful knowledge checks, answer explanations, and
  reduced-motion or text alternatives where a visual or animation carries meaning.
- Do not copy proprietary training material or submit generated material without human
  factual, licensing, assessment, and accessibility review.
- All catalog changes must pass schema validation. Every module requires an
  end-of-module check.

Software is licensed under Apache-2.0. Material under `content/` is licensed under
CC BY 4.0 unless a file states otherwise. Contributors affirm that they have the right
to submit their work under those terms.

## Release responsibilities

Only maintainers may create a release tag. A release pull request must update
`CHANGELOG.md`, `RELEASE_NOTES.md`, `package.json`, and
`self-host/compatibility.json` together.

The manually dispatched release workflow is validation-only. It must never publish,
sign, push, or request deployment credentials. A version tag runs the same governance
and quality gates before publishing versioned platform, content, migration,
compatibility, manifest, checksum, provenance, and OCI artifacts. Maintainers must
review the migration, known-limitations, and rollback sections before approving the
release environment.

## Security and privacy

Never include credentials, tokens, tenant or deployment identifiers, learner records,
personal information, private PMO material, or production data in code, fixtures,
issues, or pull requests. Use synthetic fixtures.

Report vulnerabilities through the private process in [SECURITY.md](SECURITY.md).
General help and supported-version expectations are documented in
[SUPPORT.md](SUPPORT.md).

# Contributor-credit packages

Project 42 contributor-credit packages connect accepted Learn, Field Guide, and
training content to durable repository evidence. They do not infer credit from
the last Git committer, grant repository access, or treat a mutable provider
username as identity.

The versioned contract is
`schemas/contributors/contributor-credit-package.schema.json`. The TypeScript
API exports the corresponding types and these functions:

- `validateContributorCreditPackage` fails closed on incomplete evidence,
  invalid consent, retained identity after deletion, private email fields, and
  unsafe URLs.
- `buildPublicContributorCreditExport` emits the accepted content version,
  merged pull request, accepted commit, role, consented public profile, and AI
  assistance disclosure. It omits internal contributor references, provider
  account references, and identity-proof digests.
- `buildContributorCreditView` gives Learn and Field Guide the same semantic
  section/list contract, role labels, contextual evidence links, and text
  equivalents.

## Evidence and identity

Every package records the repository provider and stable repository ID, merged
pull-request ID and URL, merge commit, accepted commit, merge timestamp, and
accepted content version. An active contributor is bound to an immutable
provider account reference and an identity-proof digest. Display names and
profile URLs are presentation data, so changing a provider username cannot
change the evidence identity.

The supported contribution roles are author, reviewer, subject-matter expert,
and accessibility reviewer. A package requires at least one author. Multiple
people may receive different roles, and one person may receive multiple roles
when each role is explicitly recorded.

## Consent, deletion, and AI assistance

Public attribution appears only when the account is active and consent is
currently granted. Revoked or ungranted consent renders `Anonymous contributor`
without a profile link. Account deletion additionally tombstones the provider
account reference while retaining only the opaque contributor tombstone,
identity-proof digest, contribution role, and accepted-change evidence needed
for integrity and audit.

The schema has no email property, uses `additionalProperties: false` throughout,
and the runtime validator rejects email-shaped field names. Consumers must not
join a public export to learner-account or private identity data.

AI-assisted work is credited to the accountable person, not to a model. When AI
assistance was used, the package requires a public disclosure and confirmation
that a person reviewed the evidence and accepted responsibility for the
accepted result.

## Renderer requirements

Learn and Field Guide must render the returned contract as a labelled
`section`, use the supplied heading, and place entries in a semantic list.
Evidence links must retain the contextual label supplied by the contract.
Visual-only badges, hover-only disclosure, and identity inferred from avatars
are not conforming implementations.

The fixtures in `tests/fixtures/contributors` cover AI-assisted production,
multiple reviewers, consent revocation, account deletion, and prohibited
private-email data.

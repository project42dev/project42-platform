# Learner-data policy contract

Project 42 applications use `LearnerDataPolicyV1` as the portable contract for
identity, lifecycle, consent, retention, export, deletion, recovery, tenancy, and
authorization. The default is exported as `defaultLearnerDataPolicy`.

The contract does not enable accounts by itself. `accountBackedRecords` remains
`planned` until an application has authenticated identity, a conforming record-store
adapter, authorization checks, backup/restore evidence, and learner-facing controls.

## Required invariants

Every hosted or self-hosted policy must preserve these controls:

- OpenID Connect Authorization Code with PKCE and a stable `(issuer, subject)` key;
- email is display or contact data, never an identity key or automatic merge key;
- installation or tenant scope on every command and query, denied by default;
- append-only assessment, correction, badge, export, and privileged-access evidence;
- recent authentication for export, single-response delivery, and no public object URL;
- a deletion cancellation window, verified active-store deletion, finite backup
  expiry, and restore-time deletion replay;
- learner, support, content-editor, administrator, and system roles with the
  content-editor role unable to access learner records; and
- auditable privileged actions and deterministic recovery objectives.

`validateLearnerDataPolicy` rejects policies that weaken these invariants.

The accepted minimal profile includes optional `displayName`, `locale`, and
`timeZone` values plus explicit `reducedMotion` and `highContrast`
accessibility preferences. Locale values use BCP 47 language tags and time
zones use IANA identifiers. Deployments must not add sensitive demographic or
advertising fields to the reusable profile contract.

New consent decisions are restricted to the purposes declared by
`defaultLearnerDataPolicy` and its current `policyVersion`. Older installations
may retain historical consent rows with `contractStatus: "legacy"` so exports
and reviews remain complete, but the API and database reject new legacy-purpose
or legacy-version decisions.

## Default deployment profiles

The hosted Project 42 profile uses Cloudflare D1 for structured learner records
behind the authenticated Cloudflare Worker API. The supported reference self-host
profile uses PostgreSQL. Both adapters must pass the same identity, lifecycle,
idempotency, export, deletion, recovery, authorization, and transcript-rebuild
conformance suite before account-backed records become available.

Identity remains an OpenID Connect adapter rather than a vendor-specific record. A
deployment must provide a stable issuer and subject. If its hosting platform exposes
only an email address, account-backed records must remain disabled.

## Safe customization

Self-hosters may change policy IDs, dates, display wording, optional consent purposes,
retention windows, and recovery objectives to match documented legal and operational
requirements. A changed consent vocabulary must be versioned in the runtime contract
and migrations before it is accepted by the API. Self-hosters must not:

- key or merge accounts by email;
- remove tenant isolation or deny-by-default authorization;
- give content editors learner-record access;
- allow public export URLs;
- remove export or privileged-action audit events; or
- create indefinite backup retention or omit deletion replay after restore.

Run `validateLearnerDataPolicy(customPolicy)` during startup and deployment. Treat a
failed result as a release-blocking configuration error.

The account service separately reads `ACCOUNT_MERGE_REQUIRED_CONSENTS` during
startup. This JSON array must contain at least one `purpose` and
`policyVersion` pair. Keep it aligned with the deployment's validated learner
data policy. Duplicate-account completion fails closed unless both accounts'
latest decision for every configured purpose is a grant for the exact configured
version.

Account deletion returns a private status receipt whose raw token is returned
only when the receipt is issued. Only a SHA-256 digest of its high-entropy token
is stored. `POST /v1/deletion-status` accepts the request ID and private token
and returns only request state and timestamps, including after active account
data and identity bindings have been erased. The completion tombstone retains
no name, email, issuer, subject, or raw token.

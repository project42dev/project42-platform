# Role, installation, and tenant authorization

Project 42 authorizes application behavior from its own durable account record.
Identity providers authenticate an issuer and subject; they do not assign a
Project 42 product role. GitHub linkage, contribution credit, repository
permissions, CODEOWNERS membership, and interface visibility are likewise not
authorization inputs.

## Deployed roles

The current contract has exactly two roles:

| Role | Authority |
|---|---|
| `learner` | Approved self-scoped profile, progress, attempts, transcript, badges, consent, export, deletion, and identity controls |
| `owner` | Learner authority plus administration within the same installation |

There is no deployed `admin`, `support`, `content-editor`, `contributor`,
`reviewer`, or `instructor` role. An `owner` has learner rights even if an
adapter returns only the `owner` assignment. An account containing an unknown,
future, non-string, empty, or duplicate role assignment fails closed.

## Authorization inputs

Every protected decision requires:

1. an authenticated, durable account ID;
2. the account's current installation ID;
3. the requested installation ID;
4. the current application account state;
5. durable Project 42 role assignments; and
6. the target account ID for a self-service operation.

The account and requested installation IDs must be non-empty and equal.
Self-service targets must equal the authenticated account. Adapters must include
the installation predicate in every protected query and mutation; request
parameters cannot override that scope.

## Permission and state matrix

| Permission | Pending | Approved learner | Approved owner | Rejected, suspended, or revoked |
|---|---:|---:|---:|---:|
| Account-state receipt | Own account only | Own account only | Own account only | Own account only |
| Data-rights consent, export, and deletion | Own account with required recent authentication | Own account | Own account | Own account with required recent authentication |
| Learner records and profile | Denied | Own account | Own account | Denied |
| Session establishment or renewal | Denied | Allowed | Allowed | Denied |
| Installation administration | Denied | Denied | Same installation only | Denied |

Privacy rights are not learner-record access. A non-approved identity may use
only the explicit consent, export, and deletion allowlist after the route's
recent-authentication checks. It cannot access progress, assessments,
transcripts, badges, profile, linked identities, or administration.

## Administrative authority

Owner routes are protected twice:

- the `/v1/admin` namespace performs a deny-by-default owner preflight; and
- each implemented operation retains its specific owner and input checks.

The owner preflight uses the same application account, state, role, and
installation contract as learner authorization. Denied role/scope decisions
append privacy-safe audit events. Domain, account state, merge/recovery,
deletion, notification, profile, progress, transcript, export, and badge
mutations retain their operation-specific immutable audit events.

Audit metadata may contain the route, HTTP method, permission, denial category,
account state, request ID, and opaque application IDs. It must not contain
provider tokens, authorization codes, email addresses, raw identity claims,
tenant identifiers, or private deployment values.

## Adapter conformance

Cloudflare D1 and the PostgreSQL compatibility profile share the same Worker
authorization evaluator and repository predicates. Their schemas accept only
`learner` and `owner`; their protected joins, queries, and mutations always
bind the role assignment to both the configured installation and durable user.

Conformance includes:

- learner and owner allow cases;
- unauthenticated, unapproved, unknown-role, malformed-role, and missing-role
  denial;
- cross-account and cross-installation denial;
- stale browser-session and current bearer-token behavior;
- owner namespace protection and privacy-safe audit evidence; and
- D1 and live PostgreSQL role/FK enforcement.

## Extension contract

A future role is a versioned product change, not a new string in the role table.
It requires:

1. a named product permission that cannot be represented by `learner` or
   `owner`;
2. an updated authorization matrix and public API contract;
3. D1 and PostgreSQL migrations with rollback and recovery evidence;
4. deny-by-default tests for old and new releases;
5. privacy, security, and audit review; and
6. hosted and self-host production acceptance evidence.

Until those gates pass, any future role value is invalid and denies the
operation.

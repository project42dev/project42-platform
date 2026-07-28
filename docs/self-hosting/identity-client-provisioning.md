# Provision identity clients safely

<!-- markdownlint-disable MD013 -->

Project 42 consumes provider-neutral OpenID Connect (OIDC), but each deployment
still needs browser, API, or identity-link client registrations. This contract
makes those infrastructure registrations repeatable without pretending that every
provider permits silent creation.

The contract is reusable by hosted Project 42 and independent self-hosted
installations. It contains no Project 42 production tenant, organization, account,
client, domain, or secret identifiers.

## Supported registration modes

| Mode | Use it when |
| --- | --- |
| `api` | A supported provider API can create and manage the client after an accountable administrator grants the provisioning identity its authority. |
| `resumable-owner-gate` | The provider requires an owner, tenant administrator, organization administrator, account holder, legal agreement, or interactive confirmation. |
| `preconfigured` | An organization supplies an existing client and secret-manager references for Project 42 to validate. |

A resumable gate is a bounded deployment state. It is never presented to a learner
or routine Project 42 account administrator. An abandoned, denied, expired, or
cancelled gate leaves the deployment unready.

## Versioned public artifacts

- `schemas/identity/identity-provisioning-contract.schema.json` validates plans,
  durable operation records, and provider compatibility declarations.
- `src/identity-provisioning.ts` exports the corresponding TypeScript contracts,
  state-transition policy, validation, drift assessment, and readiness decision.
- `self-host/compatibility.json` declares which provisioning contract and modes a
  release supports.
- `examples/identity-provisioning/` provides packaged API, owner-gate, ready, and
  provider-compatibility examples. Test fixtures prove credential leakage is
  rejected.

`IDENTITY_PROVISIONING_CONTRACT_VERSION` changes only when a consumer-visible
contract changes.

## Adapter boundary

An adapter implements `IdentityProvisioningAdapter` and declares an
`IdentityProviderCompatibility` record. The engine calls one
capability-negotiated `execute` method with:

- the requested lifecycle operation;
- an immutable desired-state plan;
- the prior durable record, if one exists;
- a stable idempotency key;
- the operation time; and
- an `IdentityProvisioningSecretSink`.

The adapter result can contain only a next state, typed continuation, opaque secret
reference, post-action observation, rollback metadata, and non-sensitive detail
code.

The secret sink is the only interface that receives one-time secret material. It
writes the bytes directly to the configured secret manager and returns an opaque,
versioned `IdentityProvisioningSecretReference`. Adapters and orchestration code
must not return, serialize, log, cache, or persist the material.

## Durable state machine

```text
planned -> preflight -> provisioning -> secret-pending -> validating -> ready
                      \-> awaiting-authority -> provisioning

ready -> rotating -> validating -> ready
ready -> disabled -> validating -> ready
ready -> retired

failed -> preflight | recovering | retired
recovering -> preflight | validating | ready | failed | retired
```

Additional transitions are encoded by
`canTransitionIdentityProvisioningState`. `retired` is terminal.

Every operation has:

- a stable operation ID and idempotency key;
- an attempt number;
- monotonic timestamps;
- contiguous audit events;
- an optional authority continuation;
- only opaque secret references and digests;
- a normalized post-provider observation;
- typed drift findings;
- rollback or recovery metadata; and
- a public-safe typed error.

Repeating the same operation with the same idempotency key must return the same
durable outcome or safely resume it. It must not create a second provider client,
secret, or owner gate.

## Preflight and desired state

Before any provider write, create and validate an
`IdentityProvisioningPlan`. It binds:

- the installation reference;
- provider, adapter version, mode, issuer, authority class, and capabilities;
- public, API, or identity-link client type;
- exact HTTPS redirects, logout redirects, and origins;
- Authorization Code flow and PKCE behavior;
- token-endpoint authentication method;
- scopes and provider permissions;
- secret-manager and rotation policy; and
- a canonical desired-state digest.

The public browser client requires PKCE and cannot use a client credential.
Confidential API and linkage clients require an approved token-endpoint
authentication method and a rotation policy.

## Authority continuation

A continuation contains only:

- a gate ID;
- the exact accountable authority class;
- a stable reason code;
- a digest of the unguessable continuation value;
- the HTTPS provider action URL;
- an expiry time; and
- pending, approved, denied, expired, or cancelled status.

The raw continuation value belongs in a protected, short-lived channel. Persist
only its digest. After the person completes the provider step, resume through the
same operation and idempotency key. Never trust query parameters or a claimed
provider client identifier without post-action ownership validation.

## Observation, drift, and readiness

The adapter normalizes provider state into:

- a digested provider client reference;
- the observed configuration digest;
- ownership verification;
- issuer verification;
- exact callback verification;
- least-privilege permission verification;
- credential health; and
- enabled or disabled state.

`assessIdentityProvisioningDrift` treats ownership, issuer, callback, permission,
and credential failures as security-critical. Configuration-digest and
enabled-state changes are operational drift. A provider adapter may add a
reviewable reconciliation plan, but it must not silently overwrite
security-relevant provider state.

`evaluateIdentityProvisioningReadiness` fails closed unless:

1. the record belongs to the plan and client;
2. state is `ready`;
3. post-registration observation exists and has no drift;
4. any authority gate is approved;
5. an active opaque secret reference exists when required;
6. no typed operation error exists; and
7. no security-critical drift remains.

## Rotation and rollback

When a provider supports overlapping credentials:

1. create the replacement through the secret sink;
2. validate the replacement against the provider;
3. update consumers using a versioned secret reference;
4. prove the previous credential is no longer used;
5. revoke the previous credential; and
6. validate readiness again.

If a provider cannot overlap credentials, its compatibility record must say so
and the operator must receive an explicit interruption and rollback plan.

Rollback metadata records only whether restoration is safe, the prior lifecycle
state, a reason code, and a snapshot digest. It does not contain a provider export
or credential. Recovery must re-observe provider state before declaring readiness.

## Provider compatibility

Each adapter publishes:

- provider and adapter version;
- evidence review date and first-party sources;
- supported registration modes, operations, and client kinds;
- mandatory authority gates;
- supported secret kinds;
- overlapping-rotation support;
- registration-management support; and
- recovery support.

The compatibility record is a capability claim, not a request to broaden provider
permissions. Installers must reject an operation the adapter does not advertise.

## Threat controls

| Threat | Required control |
| --- | --- |
| Secret exposure | Direct secret-sink write; opaque references and SHA-256 digests only; forbidden credential-field validation |
| Wrong tenant or organization | Authority-bound reference digest and post-registration ownership observation |
| Callback takeover | Exact HTTPS redirect and origin validation plus post-provider comparison |
| Permission escalation | Desired least-privilege set, compatibility capability check, and security-critical drift |
| Consent replay or CSRF | Expiring continuation, digest storage, state binding, single idempotency key, and provider callback verification |
| Duplicate client creation | Durable operation record and idempotent adapter execution |
| Malicious discovery or SSRF | Adapter-owned allowlist, HTTPS, redirect limits, and issuer/registration-endpoint policy |
| Silent destructive reconciliation | Reviewable drift result; rollback metadata; no automatic security-state overwrite |
| Audit leakage | Actor classes, stable codes, opaque references, and correlation IDs only |

## Self-host installer requirements

A supported installer must:

1. choose an adapter and secret manager explicitly;
2. validate provider compatibility before writes;
3. render a resumable owner gate accessibly when required;
4. persist non-secret state outside the application image;
5. resume safely after interruption or upgrade;
6. fail closed on callback, ownership, permission, issuer, credential, or secret
   drift;
7. expose validation and decommission evidence to the operator; and
8. keep local tenant, organization, branding, and secret configuration outside
   upstream packages.

Provider-specific setup instructions supplement this contract; they cannot weaken
it.

## Resumable engine

`IdentityProvisioningEngine` is the reference orchestrator. It accepts:

- an `IdentityProvisioningRecordStore`;
- an `IdentityProvisioningSecretSink`;
- one capability declaration and adapter per provider;
- an injectable UTC clock; and
- an injectable operation/correlation ID factory.

The record store uses compare-and-set persistence. `save(record,
expectedUpdatedAt)` fails when another process changed or replaced the operation.
The included `InMemoryIdentityProvisioningRecordStore` is for tests, evaluation, and
installer prototypes. Production deployments must persist the same records in a
durable database or state service.

Start or resume an operation with:

```ts
const result = await engine.run({
  plan,
  operation: "create",
  idempotencyKey: deploymentOperationId,
  actor: "automation",
});
```

Calling `run` again with the same bound idempotency key returns the completed or
pending result without creating another provider client or secret. A different key
cannot create a second non-retired client for the same client reference.

When the result is `awaiting-authority`, show the provider action to the exact
required authority. Retrieve the raw continuation value from the protected
deployment channel and resume with:

```ts
const result = await engine.decideAuthority({
  plan,
  idempotencyKey: deploymentOperationId,
  actor: "organization-admin",
  decision: "approved",
  continuationValue: readFromProtectedChannel(),
});
```

The engine hashes the supplied value, compares it to the persisted digest without
early-exit comparison, verifies the actor class and expiry, then resumes through the
same adapter and operation. Wrong actor and proof attempts add public-safe audit
events but do not consume a valid pending gate. Denial, cancellation, and expiry
produce typed failed states without a provider write.

Retryable adapter or readiness failures keep the same operation and idempotency key,
increment the durable attempt, enter recovery, and re-observe provider state. A
non-retryable failure returns the original result until an operator starts a
different governed operation.

The engine rejects:

- invalid plans, records, adapter compatibility, or state transitions;
- missing provider adapters;
- mode, version, operation, or client-kind capability mismatches;
- idempotency rebinding;
- stale compare-and-set writes;
- duplicate create operations;
- malformed authority results; and
- persisted provider results that fail the public record contract.

The packaged tests use a deterministic provider control plane and secret sink. They
exercise API and owner-gated creation, process restart, exact authority and proof,
denial, expiration, retry, drift, rotation, adapter upgrade, disablement, retirement,
and unsupported operations without calling an external provider or persisting raw
credentials.

## Keycloak Admin REST reference adapter

`KeycloakIdentityProvisioningAdapter` is the executable API-mode reference for
self-hosted deployments. Configure it with:

- the Keycloak base URL and realm;
- a SHA-256 digest that binds the installer to the expected tenant-administration
  boundary;
- an asynchronous function that returns a short-lived Keycloak administration
  access token;
- the deployment secret sink; and
- a durable engine record store.

The adapter supports `create`, `validate`, `observe`, `reconcile`, `rotate`,
`recover`, `disable`, and `retire`. It uses the current Keycloak Admin REST client
endpoints and OIDC discovery. It does not persist or log the administration token
or generated client secret.

```ts
const adapter = new KeycloakIdentityProvisioningAdapter({
  baseUrl: configuration.keycloakBaseUrl,
  realm: configuration.realm,
  authorityReferenceDigest: configuration.authorityDigest,
  accessToken: () => tokenProvider.getShortLivedAdminToken(),
});
```

The desired client is Authorization Code only, disables implicit and password
grants, disables service accounts and authorization services, sets
`fullScopeAllowed=false`, and accepts no Project 42 management permissions. Exact
redirect URIs, post-logout URIs, web origins, PKCE policy, issuer discovery,
enabled state, and credential digest are observed after each provider write.

For confidential clients, Keycloak returns the generated secret only to the
adapter. The adapter immediately copies it into `IdentityProvisioningSecretSink`,
zeros its byte buffer, and persists only the returned opaque reference. Rotation
first stores and verifies the new version, then invalidates Keycloak's rotated
secret and revokes the previous secret-manager reference.

Production Keycloak endpoints must use HTTPS. The adapter permits HTTP only for
explicit loopback evaluation URLs. Its access-token callback should obtain a
short-lived token from the deployment's protected identity or secret system; do
not put an administrator password or token in a plan, record, browser, command
line, source file, or generated artifact.

The deterministic adapter tests emulate the current Admin REST behavior and cover
first deployment, idempotent rerun, wrong authority, callback drift, same-operation
recovery, provider interruption, overlapping rotation, disablement, retirement,
and browser-public PKCE clients. The self-host Compose gate remains responsible
for verifying the selected Keycloak image and deployment configuration together.

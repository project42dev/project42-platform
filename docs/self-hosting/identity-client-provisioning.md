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

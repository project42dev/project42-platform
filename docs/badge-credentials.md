# Badge credential domain contract

The badge credential contract separates browser-local achievements from durable,
issued credentials. A local achievement is not a credential and must not be
described as verified merely because it appears in a progress record.

## Versioned definitions

Every durable badge definition declares:

- a stable identifier and immutable definition version;
- a participation, completion, or mastery class;
- versioned criteria and version-bound evidence requirements;
- accessible display text with an explicit default language;
- the issuer, identity, correction, and revocation policy;
- expiration behavior; and
- the interoperability boundary.

Mastery definitions fail validation unless they require a passing assessment with
an explicit assessment version, content version, and minimum score. Visit-only
evidence cannot satisfy completion or mastery criteria, and evidence dated after
an issuance or correction event fails closed.

## Append-only lifecycle

An issued credential begins with one `badge.issued` event. Corrections,
revocations, and expirations append new events that name the event they supersede.
They never replace or delete the original issuance. The pure projector validates
the complete chain, rejects unsupported contract versions, and produces the same
projection for the same credential-scoped sequences without mutating its inputs.

The domain contract contains no database, identity-provider, hosting, or user
interface assumptions. Adapters can persist the event stream after the domain
semantics are proven.

## Open Badges boundary

The contract reserves a future mapping to Open Badges 3.0. The required status is
`future-mapping-not-conformant`, and `conformanceClaim` must remain `false`.
Project 42 must not claim Open Badges conformance until issuer governance,
credential signing, status and revocation publication, privacy review, and the
full interoperability test suite are implemented.

# Authoritative learning command and event contract

Project 42 uses versioned commands and append-only events as the durable source for
progress, assessment, transcript, badge, export, deletion, and recovery
projections.

## Invariants

Every command binds:

- installation and learner;
- schema and content version;
- assessment version when an assessment is involved;
- a caller-generated 16–128 character idempotency key;
- an accountable learner, owner, or system actor; and
- an ISO UTC occurrence time.

The idempotency key is unique within one installation and learner. Repeating the
same command returns the original event. Reusing the key for different command
content is a conflict. Distinct keys produce distinct immutable attempts even when
commands arrive concurrently.

Assessment events retain the submitted answers, original score, pass result,
content version, and assessment version. A later correction is a new
`assessment.corrected` event referencing the original attempt. It never overwrites
or disguises the submitted attempt.

The contract contains no email, display name, identity-provider token, session
value, tenant-specific identifier, or hosted configuration.

## Command types

| Command | Authoritative intent |
|---|---|
| `path.enroll` | Preserve the path title, ordered module set, and badge definition used for projection |
| `module.visit` | Record that the learner reached a module |
| `assessment.record` | Preserve one immutable set of answers and its score |
| `module.complete` | Preserve explicit mastery evidence for a module |
| `assessment.correct` | Append an accountable correction without rewriting the original attempt |

Each successful command produces the corresponding past-tense event. Event
sequence is assigned by the storage adapter and is the deterministic rebuild
order. `recordedAt` may follow `occurredAt`, but never precedes it.

## Compatibility

The current contract version is `1.0`. Unknown fields and unknown command or event
types fail closed. Content and assessment versions remain with historical records,
so publishing new content cannot silently change an old score or completion.

`SqlLearningEventStore` implements the contract for both Cloudflare D1 and the
PostgreSQL compatibility adapter. Hosted deployments apply
`migrations/0008_authoritative_learning_events.sql`; self-hosted deployments apply
`self-host/postgres/005_learning_events.sql`. Both use an optimistic stream
revision and per-write token so a racing command either commits once or retries
against the new authoritative revision.

Adapter authors can run `runLearningEventStoreConformance(store, scope)` against an
isolated, pre-created installation and learner. The public harness proves:

- identical retry and idempotency-key rebinding behavior;
- concurrent attempt preservation, including falsey answers and scores;
- correction, transcript, badge, and deterministic rebuild behavior;
- installation and learner authorization isolation;
- lossless export; and
- explicit learner-record deletion.

The harness removes only the learning-event stream in the supplied scope. It does
not delete the installation or learner.

Hosted and self-hosted release validation uses
`runLearningRecordAdapterConformance` to combine this suite with receipt
conformance, then `verifyLearningRecordAdapterParity` to reject semantic drift
between Cloudflare D1 and PostgreSQL. See the
[hosted adapter guide](hosted-learning-record-adapter.md).

Verified export, governed deletion, and post-backup replay are defined separately
in [learning-record receipts](learning-record-receipts.md).

JSON Schema:

`schemas/learning/learning-event-contract.schema.json`

Examples:

- `examples/learning-events/assessment-command.json`
- `examples/learning-events/assessment-recorded-event.json`

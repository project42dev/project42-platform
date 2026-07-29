# Learning-record recovery promotion gate

Project 42 recovery is complete only when authoritative learning events,
post-backup deletion receipts, rebuilt projections, integrity checks, and measured
objectives all pass before the restored service becomes available.

`runLearningRecordRecoveryConformance` provides a reusable, provider-neutral gate
for Cloudflare D1, PostgreSQL, and replacement adapters. It uses synthetic
learners in isolated databases and never requires production learner data.

## Required sequence

1. Start with empty, isolated source and restore learner streams.
2. Create retained and later-deleted learner evidence.
3. Capture verified exports before the deletion request and package them in a
   recovery artifact whose manifest records the adapter, migration head,
   capture timestamps, stream and event counts, payload byte count, and
   payload SHA-256 checksum. A second canonical artifact SHA-256 binds every
   one of those manifest values together with the exact serialized payload;
   the backup ID derives from that artifact digest.
4. Retain the deletion receipt outside the older backup.
5. Verify the serialized artifact and every embedded export before the first
   restored event is written. Reject malformed, truncated, byte-count or
   checksum-mismatched, manifest-tampered, duplicate-scope, incomplete,
   cross-adapter, wrong-migration-head, or schema-extension artifacts.
6. Restore events in their exact authoritative order. A clean database may
   assign new monotonically increasing physical sequence numbers; every event's
   stable identity, content, actor, timestamps, command digest, and relative
   order must remain identical.
   If a restore write is interrupted, clear the isolated learner stream before
   returning the failure; never promote or continue from a partial stream.
7. Reject altered and incomplete exports before promotion.
8. Rebuild enrollments, modules, attempts, corrections, transcripts, badges,
   and mastery evidence. Compare a canonical SHA-256 projection digest with
   the verified pre-backup projection.
9. Replay the post-backup deletion receipt against the restored deleted learner.
10. Confirm that the deleted stream is empty.
11. Calculate measured recovery point and recovery time from UTC evidence and
    compare both with declared objectives.
12. Promote only when the report returns `promotionStatus: ready`.

The gate throws on any failed step. It never returns a warning-only or
partially-ready state.

## Public API

```ts
import {
  runMeasuredLearningRecordRecoveryConformance,
  SqlLearningEventStore,
} from "@project42/platform";

const report = await runMeasuredLearningRecordRecoveryConformance(
  new SqlLearningEventStore(isolatedSourceDatabase),
  new SqlLearningEventStore(isolatedRestoreDatabase),
  {
    installationId: "recovery-installation",
    retainedLearnerId: "recovery-retained",
    deletedLearnerId: "recovery-deleted",
    keyPrefix: "quarterly-rehearsal",
  },
  {
    backupCapturedAt: "2026-07-28T18:00:00.000Z",
    sourceCurrentAt: "2026-07-28T18:02:00.000Z",
  },
);
```

The measured gate captures the recovery start immediately before its first
precondition check and captures completion only after projection rebuild,
deletion replay, and empty-stream verification pass. Its default UTC clock is
the system clock. Tests may inject `now` for deterministic evidence, but
production release gates should use the default.

When the caller omits explicit objectives, the measured gate enforces the
approved defaults:

- recovery point objective: 24 hours (`86,400` seconds); and
- recovery time objective: 8 hours (`28,800` seconds).

The report records both measured values, both objectives, the backup checksum
and byte count, the adapter and migration head, verified deletion-receipt and
replay status, transcript/badge/attempt/correction counts, and identical
pre-backup and rebuilt projection digests. These fields are machine-verifiable
promotion evidence, not an operator narrative.

`runLearningRecordRecoveryConformance` remains available when an operator must
validate already-recorded start and completion timestamps from an external
recovery orchestrator. It does not substitute for the measured gate when the
platform itself performs the rehearsal.

`restoreVerifiedLearningRecordExport` is the lower-level restore primitive. It
validates the receipt, scope, event digest, count, and revision before writing,
requires an empty target stream, restores exact order, and compares every
restored event while excluding only the database-assigned physical sequence.
Corrupt, incomplete, cross-scope, reordered, or non-empty-target restores fail
closed. An interrupted restore clears its isolated target stream before
returning the original error.

`createLearningRecordRecoveryBackup` creates the serialized backup artifact.
`verifyLearningRecordRecoveryBackup` must run before restore and requires the
operator to supply the expected adapter and migration head. Recomputing an
individual payload checksum does not make a stale or wrong-head backup eligible
for promotion: the canonical artifact checksum also binds adapter, migration
head, timestamps, counts, byte length, and payload checksum. Its manifest must
still match the target runtime and every embedded export receipt must validate.
Runtime verification rejects properties not declared by the machine-readable
artifact, manifest, or payload schema.

`measureLearningRecordRecovery` validates UTC chronology and calculates:

- recovery point as `sourceCurrentAt - backupCapturedAt`; and
- recovery time as `recoveryCompletedAt - recoveryStartedAt`.

Both results must remain within the caller's approved objectives.

Machine-readable report schema:

`schemas/learning/learning-record-recovery-report.schema.json`

Machine-readable backup artifact schema:

`schemas/learning/learning-record-recovery-backup.schema.json`

## Adapter evidence

The automated suite runs the full recovery rehearsal against local ephemeral
Cloudflare D1 through Miniflare. In CI, it also creates two isolated PostgreSQL
schemas, applies every self-host migration independently, restores the verified
backup into the second schema, replays the post-backup deletion, checks the
persisted deletion receipt and replay records, proves the deleted stream is
empty, and compares exact projection digests. Both paths use the default system
clock and the 24-hour/8-hour objectives.

## Cloudflare quota boundary

The automated conformance test uses ephemeral local Miniflare D1 databases. These
do not create Cloudflare account resources or consume the account's D1 database
quota.

A remote restore rehearsal must use an isolated target and must be explicitly
authorized, quota-checked, and deleted after evidence is captured. Do not create
multiple remote probes for one rehearsal. Production restoration can combine:

- the local synthetic promotion gate for deletion replay, projection rebuild,
  corruption rejection, and objective enforcement; and
- a controlled production export/schema rehearsal for real table inventory,
  row counts, migration checksums, and foreign-key integrity.

Production identifiers, bookmarks, measured operational evidence, and any export
containing learner data belong only in the private operations repository.

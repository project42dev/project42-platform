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
3. capture verified exports before the deletion request.
4. Retain the deletion receipt outside the older backup.
5. Verify every export before the first restored event is written.
6. Restore events in their exact authoritative order. A clean database may
   assign new monotonically increasing physical sequence numbers; every event's
   stable identity, content, actor, timestamps, command digest, and relative
   order must remain identical.
   If a restore write is interrupted, clear the isolated learner stream before
   returning the failure; never promote or continue from a partial stream.
7. Reject altered and incomplete exports before promotion.
8. Rebuild the retained learner's transcript and badge projections and compare
   them with the verified pre-backup projections.
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
  runLearningRecordRecoveryConformance,
  SqlLearningEventStore,
} from "@project42/platform";

const report = await runLearningRecordRecoveryConformance(
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
    recoveryStartedAt: "2026-07-28T18:03:00.000Z",
    recoveryCompletedAt: "2026-07-28T18:03:01.500Z",
    maximumRecoveryPointSeconds: 300,
    maximumRecoveryTimeSeconds: 10,
  },
);
```

`restoreVerifiedLearningRecordExport` is the lower-level restore primitive. It
validates the receipt, scope, event digest, count, and revision before writing,
requires an empty target stream, restores exact order, and compares every
restored event while excluding only the database-assigned physical sequence.
Corrupt, incomplete, cross-scope, reordered, or non-empty-target restores fail
closed. An interrupted restore clears its isolated target stream before
returning the original error.

`measureLearningRecordRecovery` validates UTC chronology and calculates:

- recovery point as `sourceCurrentAt - backupCapturedAt`; and
- recovery time as `recoveryCompletedAt - recoveryStartedAt`.

Both results must remain within the caller's approved objectives.

Machine-readable report schema:

`schemas/learning/learning-record-recovery-report.schema.json`

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

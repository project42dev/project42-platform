# Hosted learning-record adapter

Project 42 uses the same `SqlLearningEventStore` semantics on Cloudflare D1 and
PostgreSQL 17. The hosted Worker must explicitly select `cloudflare-d1` through
`LEARNING_RECORD_ADAPTER`; the self-hosted Node service must explicitly select
`postgresql`. Missing, unknown, or runtime-incompatible values fail closed.

The current semantic fingerprint is:

```text
learning-records/1.0;events/1.0;receipts/1.0;append-only;atomic-batch;optimistic-revision;verified-deletion-replay
```

It binds contract versions, append-only history, optimistic stream revisions,
transactional batches, verified export/deletion receipts, and deletion replay.
It contains no deployment, tenant, database, learner, or owner identifier.

## Transaction behavior

Each append uses three statements in one transaction. Verified deletion uses
three statements and deletion replay uses four. Four is therefore the accepted
maximum statement count for one learning-record transaction in this release.

Cloudflare documents that D1 `batch()` executes prepared statements sequentially
and transactionally: a failed statement rolls back the sequence. The PostgreSQL
compatibility adapter explicitly executes the same sequence inside
`BEGIN`/`COMMIT` and rolls back on failure.

Both adapters run `runLearningRecordAdapterConformance`. CI also passes both
reports to `verifyLearningRecordAdapterParity`, which fails on any difference in
contract versions, checks, event counts, deletion counts, replay counts, or the
semantic fingerprint.

## Cloudflare limits and signals

Source facts were revalidated against Cloudflare documentation on 2026-07-28:

- [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/) states that one
  database has a hard 10 GB maximum, processes queries one at a time, queues
  concurrent work, and can return an overloaded error when the queue fills.
- [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
  defines sequential transactional batch behavior.
- [Metrics and analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/)
  exposes rows read, rows written, query response bytes, query latency, and
  database size, with 31 days of retention.
- [D1 pricing metrics](https://developers.cloudflare.com/d1/platform/pricing/)
  explains row-read and row-write accounting and why indexed point queries are
  required for predictable cost.

Cloudflare plan allowances can change and must be revalidated before deployment.
The following are Project 42 operating thresholds, not Cloudflare platform
claims:

| Signal | Accepted threshold | Required response |
|---|---:|---|
| Database size | warn at 7 GiB | capacity review and growth forecast |
| Database size | freeze large imports at 8 GiB | shard or migrate before resuming |
| `queryBatchTimeMs` p95 | target at or below 100 ms | investigate after three 15-minute windows |
| `queryBatchTimeMs` p99 | alert above 250 ms | inspect query plans, indexes, and concurrency |
| Query batch latency | critical at or above 1,000 ms | incident response |
| Overloaded errors | no sustained errors | incident response on any sustained occurrence |
| Learning-record batch | at most four statements | release fails on contract expansion without review |

The 8 GiB change freeze leaves at least 20 percent headroom below the provider
maximum. It does not delete or truncate learner records. Capacity remediation
must preserve receipts, audit evidence, exports, and tenant boundaries.

## Repeatable reference measurement

`npm run learning-records:measure` creates 50 isolated learner streams in an
ephemeral Miniflare D1 database, appends one event to each, rebuilds every stream,
checks the final counts, captures D1 row metadata when the emulator exposes it,
and emits one JSON report. The release gate requires zero errors and p95 below
1,000 ms.

This deterministic measurement detects gross regression in release CI; it is not
a substitute for production metrics. Deployment evidence must additionally
capture the hosted database size, 15-minute p95/p99 latency, rows read/written,
overload count, release version, and migration head without recording query
parameters or learner data.

## Deployment gate

Before the hosted API accepts learning commands:

1. Apply migrations through `0009_learning_record_receipts.sql`.
2. Set `LEARNING_RECORD_ADAPTER=cloudflare-d1` in private deployment
   configuration.
3. Confirm `/health` reports adapter `cloudflare-d1`, contract `1.0`, and the
   expected semantic fingerprint.
4. Run the public conformance and reference-measurement gates.
5. Capture production metrics and verify the thresholds above.
6. Verify encrypted export, deletion receipt retention, backup restore, and
   deletion replay in an isolated restoration database.

Production resource identifiers and operational evidence belong in the private
operations repository.

# Verified learning-record receipts and deletion replay

Project 42 learning-record adapters produce cryptographically bound receipts for
portable exports, governed deletion, and deletion replay after a backup restore.
The contracts are provider-neutral and contain no hosted tenant, database,
deployment, or credential values.

## Verified export

`LearningEventEngine.exportVerified` returns the exact ordered event stream plus a
receipt that binds:

- a one-way digest of the installation and learner scope;
- source revision and event count;
- SHA-256 digest of the canonical event sequence; and
- accountable export time.

`verifyLearningRecordExport` recomputes the scope, event, count, revision, receipt
digest, and deterministic receipt ID. Any altered event, answer, score, version, or
receipt field fails validation.

## Governed deletion

`LearningEventEngine.deleteVerified` requires explicit deletion authority and a
caller-generated 16–128 character operation key. The SQL adapter atomically:

1. confirms the optimistic learner-stream revision;
2. writes an immutable pseudonymous deletion receipt;
3. deletes the authoritative events; and
4. removes the empty stream.

Repeating the operation key returns the original receipt. Rebinding it to different
evidence fails. The durable receipt retains only a scope digest, revision, counts,
event digest, operation key, deletion time, and receipt digest—never the learner or
installation identifier.

Operation and restore IDs must be opaque workflow identifiers. Do not place an
email address, name, provider subject, tenant identifier, or other personal or
deployment information in either value.

## Backup deletion replay

A deletion receipt must be retained outside database backups created before the
deletion. After restoring a backup, an authorized recovery process supplies:

- the restored installation and learner;
- the verified deletion receipt;
- a unique restore ID; and
- the replay time.

`LearningEventEngine.replayDeletion` proves that the supplied scope hashes to the
receipt, records the restored event count and digest in an immutable replay receipt,
and removes the restored learner events atomically. Repeating the same restore ID
returns the original replay receipt.

This contract is the reusable metadata and adapter foundation. Release recovery
exercises still must measure recovery point and recovery time, import post-backup
deletion receipts before service promotion, rebuild projections, and fail closed on
corrupt or incomplete backups.

## Adapter conformance

Run `runLearningRecordReceiptConformance(store, scope)` against an isolated,
pre-created learner. The public suite validates export digests, authorization,
idempotent deletion, pseudonymous evidence, restore replay, and retry behavior.
Project 42 runs it against both Cloudflare D1 and PostgreSQL 17.

Machine-readable schema:

`schemas/learning/learning-record-receipt.schema.json`

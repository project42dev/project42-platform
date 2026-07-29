# Account notification outbox

Project 42 records account lifecycle notifications in a provider-neutral,
persistent outbox. Creating a registration request atomically enqueues its
learner receipt and a durable approved-owner fan-out intent. Recording an owner
account-state decision atomically enqueues the matching learner notification.
A committed decision therefore cannot lose its notification intent, and a
rolled-back decision cannot leave an orphan notification.

The contract covers:

- a receipt for the learner whose verified registration needs review;
- an alert for each currently approved owner;
- learner approval, rejection, suspension, and revocation decisions.

The message templates contain only the event type and the action the recipient
can take. They do not include names, decision reasons, email addresses, sign-in
links, account IDs, tenant IDs, or tracking content. Both accessible plain text
and semantic HTML are generated from the same versioned template.

## Delivery boundary

`AccountNotificationAdapter` is the public delivery contract. It receives a
rendered message only after the outbox has claimed that message. The package
includes:

- `DisabledAccountNotificationAdapter`, the default for the hosted Worker and
  reference self-host runtime; and
- `DeterministicAccountNotificationAdapter`, a test adapter that performs no
  network activity.

The reusable package does not choose an email or messaging vendor and does not
define vendor credentials. A deployment that intends to deliver notifications
must supply its own adapter to the final `handleRequest` argument or call
`D1Project42Repository.dispatchAccountNotifications` from its controlled
backend process. Do not put an adapter, API key, or vendor response in browser
code.

`POST /v1/admin/notifications/dispatch` is an owner-only backend operation. It
also requires recent authentication and accepts an optional `limit` from 1 to
100. With the default disabled adapter, it returns
`account_notification_delivery_unavailable` before claiming any row. This is a
fail-closed configuration state, not a signal to discard the queued work.

## State, concurrency, and recovery

Every notification has one explicit state:

| State | Meaning |
| --- | --- |
| `pending` | Committed and ready for its first delivery attempt |
| `delivering` | Claimed with a five-minute opaque lease |
| `delivered` | Accepted by the configured adapter; terminal |
| `retryable` | A bounded retry is scheduled |
| `dead-letter` | Attempts are exhausted or delivery cannot safely continue; terminal |

Claims use compare-and-set updates, so concurrent dispatchers cannot both own
the same notification. The claim increments the attempt counter before calling
the adapter. A crashed dispatcher leaves a lease that a later run recovers.
Retries begin at 60 seconds, double to a one-hour ceiling, and stop after five
attempts. Database checks and triggers reject attempt rollback, invalid state
transitions, mutation of notification identity, and mutation of terminal rows.

Owner alert fan-out does not add one statement per owner to the registration
transaction. A dispatcher expands at most 20 approved owners from each of at
most four durable fan-out records per run. The fan-out stores an opaque owner
cursor and revision, remains pending while another page exists, and becomes
terminal only after the complete ordered owner set has been traversed. Stable
per-owner idempotency keys and a compare-and-set cursor prevent duplicate pages
under concurrent dispatch. A large owner population therefore cannot create an
unbounded registration batch, and pending pages are never silently discarded.
The recipient set is the approved-owner view observed while each page expands;
an owner approved after a request is not owed a historical alert, and an owner
who is no longer approved is skipped at insertion time.

Stable SHA-256 idempotency keys bind the installation, authoritative event,
kind, and recipient. The outbox stores no rendered content or recipient email.
It resolves a currently verified primary email only after a successful claim.
Audit events retain the opaque notification ID, kind, state, attempt number,
and allow-listed error code; they do not retain message content, addresses, or
vendor diagnostics.

## Bootstrap

1. Back up the account database using the deployment's normal verified backup
   procedure.
2. Apply D1 migrations through
   `0016_account_notification_outbox.sql` or PostgreSQL migrations through
   `013_account_notification_outbox.sql`.
3. Confirm the new table, delivery and recipient indexes, transition guards,
   and foreign-key checks.
4. Leave delivery disabled until a backend adapter has been reviewed for
   credential handling, timeout bounds, redacted diagnostics, idempotent vendor
   behavior, and test coverage.
5. Exercise registration plus every account-state transition with the
   deterministic adapter.
6. Enable the deployment-specific adapter and run a bounded dispatch.

No initial owner, vendor, DNS, or secret is provisioned by these migrations.

## Backup, restore, deletion, and replay

The outbox and durable fan-out records are part of the same D1 or PostgreSQL
account database and must be included in database backups and restored before
traffic resumes. After a restore:

1. verify migration head and checksums;
2. run foreign-key and schema integrity checks;
3. leave `delivered` and `dead-letter` rows terminal;
4. recover expired `delivering` leases through a bounded dispatch;
5. dispatch due `pending` and `retryable` rows; and
6. compare privacy-safe delivery audit counts with outbox terminal counts.

Do not reset attempts or turn terminal rows back into pending work. If an
external delivery system accepted a message but the database failed before the
delivered transition, the adapter must use the opaque notification ID as its
idempotency reference.

Both recipient and subject user references use `ON DELETE CASCADE`. Completing
account deletion therefore removes queued and historical outbox rows that can
be associated with that learner. This does not alter immutable mastery,
transcript, or deletion-receipt evidence. Replaying an account database backup
preserves outbox states and keys exactly; replaying learner events alone does
not create notifications because notifications are account-lifecycle effects,
not learner-event projections.

## Operator checks

Use aggregate queries only; do not copy recipient addresses into evidence:

```sql
SELECT state, kind, COUNT(*) AS count
FROM account_notifications
WHERE installation_id = ?
GROUP BY state, kind
ORDER BY state, kind;
```

Investigate sustained growth in `retryable`, any `delivering` rows older than
the lease duration, or new `dead-letter` rows. Recovery must preserve the
bounded retry limit and the privacy-safe audit contract.

Also check unfinished owner fan-out without exposing owner identifiers:

```sql
SELECT state, COUNT(*) AS count
FROM account_notification_fanouts
WHERE installation_id = ?
GROUP BY state
ORDER BY state;
```

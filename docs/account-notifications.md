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

- `DisabledAccountNotificationAdapter`, the fail-closed default;
- `DeterministicAccountNotificationAdapter`, a test adapter that performs no
  network activity; and
- `ServiceBindingAccountNotificationAdapter`, selected automatically when a
  hosted Worker has an `ACCOUNT_NOTIFICATION_DELIVERY` service binding.

The reusable package does not choose an email or messaging vendor and does not
define vendor credentials. The packed Node runtime reads
`ACCOUNT_NOTIFICATION_ADAPTER_MODULE` and imports a local file or installed
package that exports `createAccountNotificationAdapter()`. The module loader is
also exported at
`@project42/platform/self-host/account-notification-adapter`. A derivative image
can install an adapter package; a Compose override can instead mount a reviewed
module read-only and set the variable to its absolute container path. Keep
adapter secrets in the deployment's secret manager, not in the module,
environment example, browser code, or repository.

Every adapter receives `{ signal, deadlineAt }` with the message. It must pass
the `AbortSignal` to cancellable provider calls and use the opaque
`notificationId` as the provider idempotency key. The runtime enforces a
five-second deadline (never configurable below 100 milliseconds), aborts the
adapter, and records an allow-listed `delivery-outcome-unknown` audit event
when the result is uncertain. It deliberately leaves that item under its
five-minute lease instead of scheduling an immediate retry. Lease recovery can
then retry the same notification ID, allowing an idempotent downstream service
to suppress a delivery accepted just before the timeout.

`POST /v1/admin/notifications/dispatch` is an owner-only backend operation. It
also requires recent authentication and accepts an optional `limit` from 1 to
10. Delivery is sequential, so one request performs no more than ten bounded
adapter calls (at most 50 seconds of adapter wait). With the default disabled
adapter, it returns `account_notification_delivery_unavailable` before claiming
any row. This is a fail-closed configuration state, not a signal to discard the
queued work. Controlled scheduler code can invoke the repository with explicit
`system` audit provenance; the HTTP route always records the authenticated
owner's opaque user and identity keys.

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
per-owner idempotency keys make recipient inserts safely repeatable. The
compare-and-set cursor advances only when SQL can prove that every selected
recipient has a matching outbox row. Owner churn or a concurrent dispatcher can
therefore leave reusable partial inserts, but cannot skip a recipient page or
create duplicate alerts on retry. A large owner population therefore cannot
create an unbounded registration batch, and pending pages are never silently
discarded.
If registration precedes owner bootstrap, an empty fan-out remains pending.
The first expansion that finds an approved owner establishes an immutable
recipient cutoff and includes that first owner. Later pages traverse the
approved owners at that cutoff; owners approved after the cutoff are not owed a
historical alert, and an owner who is no longer approved is skipped. This
provides a recoverable first-owner alert without an unbounded or moving
recipient set.

Stable SHA-256 idempotency keys bind the installation, authoritative event,
kind, and recipient. The outbox stores no rendered content or recipient email.
It resolves a currently verified primary email only after a successful claim.
Audit events retain an allow-listed `actorKind` of `owner` or `system`, the
opaque notification ID, kind, state, attempt number, and allow-listed error
code. Owner-triggered operations additionally retain the owner's opaque user
and identity keys. They do not retain message content, addresses, or vendor
diagnostics.

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

Do not reset attempts or turn terminal rows back into pending work. An owner
with recent authentication can recover a dead letter through
`POST /v1/admin/notifications/replay` with one through ten unique opaque
notification IDs. Recovery creates a new pending row linked to the immutable
dead-letter source. Repeating the request returns `alreadyReplayed` and cannot
create a duplicate. If that recovery row also reaches dead letter, it can be
recovered as a new link in the evidence chain.

If an external delivery system accepted a message but the database failed before the
delivered transition, the adapter must use the opaque notification ID as its
idempotency reference.

Both recipient and subject user references use `ON DELETE CASCADE`. Completing
account deletion therefore removes queued and historical outbox rows that can
be associated with that learner. This does not alter immutable mastery,
transcript, or deletion-receipt evidence. Replaying an account database backup
preserves outbox states and keys exactly; replaying learner events alone does
not create notifications because notifications are account-lifecycle effects,
not learner-event projections.

The automated PostgreSQL recovery rehearsal copies the account principals,
outbox, fan-outs, and privacy-safe audits into a separately migrated restore
schema. It proves that delivered and dead-letter rows remain terminal, an
expired delivering lease recovers with the same notification ID, and a restored
dead letter can create exactly one linked recovery item before promotion.

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

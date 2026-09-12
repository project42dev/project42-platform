# Requesting an account, and approving one

What happens between a stranger arriving on the site and a learner with a
record. Written down because it had never been written down, and because on
2026-09-12 the hosted installation's `users` table held three rows — all
created within three days of each other, all `approved`, all the operator's own
addresses. Nobody had ever been `pending` in production. The path below had
never been walked by a real person.

`tests/account-request-approval-path.test.mjs` walks it, end to end, against
the real Worker in Miniflare/D1.

## Where the request is made

`/account`. Signed out, that page leads with the request — what it is, what
happens next, how long, and how the answer arrives — and puts "already have an
account?" underneath it.

Reachable in one step from every page:

| Where | Control | Notes |
| --- | --- | --- |
| Header, above 760px | **Request access** | `AccountRequestAction`; signed-out only |
| Profile menu, any width | **Request access** | the phone path — `.header-action` is `display:none` below 760px |
| Profile menu | **Account** | the pre-existing route to the same page |

Both request controls render only once the account read has settled on "no
session", and only when an account service is configured. See
`web/app/lib/headerAccountPresentation.ts`: an in-flight or failed read is
`unknown`, not signed-out, and inviting an approved learner to request an
account would tell them their account does not exist.

The wording lives in `web/copy/account.ts` and is overridable leaf by leaf in
an adopter's `project42.copy.json`, like every other editorial string.

## What the server does

Pressing **Request an account** stores the terms acceptance in
`sessionStorage`, records that this browser asked, and starts
`GET /v1/auth/start` — the *same* OIDC flow the "Sign in" button starts. There
is no separate registration endpoint. A person with no account who presses
"Sign in" therefore also creates a request; the only thing they miss is the
terms acceptance, which is replayed later against
`POST /v1/registration/terms-acceptance` once a receipt exists.

On the callback, `createOrRefreshAccount` decides the state:

- configured bootstrap owner → `approved`;
- verified email matching an **enabled** domain rule, **and**
  `DOMAIN_APPROVAL_ENABLED=true` → `approved`;
- everything else → `pending`.

The hosted Worker runs with `DOMAIN_APPROVAL_ENABLED=false`, so for a genuinely
new address only the third branch is reachable. `domainApprovalEnabled` is read
per call and defaults to `false`, so a rule enabled before the flag was cleared
cannot approve anybody either.

A `pending` or `rejected` account is redirected to `?auth=pending` /
`?auth=rejected` with:

- a `__Host-project42_registration` receipt cookie — HttpOnly, Secure, 30 days;
- the browser session cookie **cleared**.

A receipt is not a session. It authenticates nothing: `/v1/auth/session`,
`/v1/me/profile` and `/v1/me/progress` all refuse a browser holding only a
receipt. Its single power is `GET /v1/registration/status`, which returns five
PII-free fields — `state`, `requestedAt`, `updatedAt`, `canSignIn`,
`nextAction` — and never the owner's decision reason.

## What the learner sees

| State | `nextAction` | Card on `/account` |
| --- | --- | --- |
| `pending` | `await-review` | "Your access request is waiting for review" |
| `approved` | `sign-in` | — receipt is already gone; see below |
| `rejected` | `contact-owner` | "This request was not approved" |
| `suspended`, `revoked` | `contact-owner` | named explicitly rather than collapsed into a generic error (AB#5780) |

## Where the request lands for the owner

The Admin console account list, whose state filter defaults to **Pending**
(`/v1/admin/accounts?state=pending`). That is the only place a request surfaces
in practice — see "What is not automatic" below.

The owner decides with
`PATCH /v1/admin/accounts/:id/state { state, reason }`. It requires owner
authority, recent authentication (72 hours), and a reason of 5–500 characters,
and it is compare-and-set against `state_revision`, so two concurrent stale
decisions cannot both commit (`tests/registration-boundary.test.mjs`).

## How the answer reaches the learner

By signing in again. That is not a simplification — it is the whole mechanism.

An owner decision clears `active_registration_request_id` and revokes every
`registration_requests` row for the account, so the waiting browser's next
status read is `401 registration_receipt_invalid`. This is deliberate: a
receipt proves an *open* request, and an unauthenticated browser must not be
able to read an account's state off a cookie forever. But it means the answer
cannot appear on the waiting page.

What the page can do, and now does, is tell the two cases apart. A 401 from a
browser that remembers asking renders "this private request receipt is no
longer valid… sign in to check access"; a 401 from a browser that never asked
renders the request card. Before this was fixed the front end resolved the
ambiguity toward "never asked" on any visit that was not immediately after a
callback, so **an approved learner returning to `/account` was shown an
invitation to request an account, as though nothing had happened.** The
distinction is `registrationPhaseForInvalidReceipt` in
`web/app/lib/registrationStatus.ts`, fed by a storage marker that holds no
identity and no secret — only the fact that a request was started in this
browser.

A declined person who signs in again gets `?auth=rejected` and a fresh receipt
reporting `rejected` / `contact-owner`, so the decline is stated rather than
failing as a generic error. Their account is not reopened as pending.

## What is not automatic

Creating a registration request atomically enqueues two notifications in the
account outbox: a receipt for the learner and a fan-out to every approved
owner. An owner decision enqueues the learner's decision notification.

**Nothing drains that outbox on a schedule.** The only caller of
`dispatchAccountNotifications` in shipped code is
`POST /v1/admin/notifications/dispatch`, an owner-only route; the Worker's
`scheduled()` handler runs audit-detail and deletion-receipt purges and nothing
else. So unless an owner explicitly dispatches, no message is sent for a new
request and none is sent for a decision — which is why the copy on `/account`
tells people to come back and sign in rather than to wait for an email.

Two consequences worth deciding on deliberately:

1. **The owner is not told a request exists.** Requests accumulate in the
   pending queue until somebody opens the Admin console.
2. **The learner is not told the decision.** The second sign-in is the only
   signal.

Wiring `dispatchAccountNotifications` into `scheduled()` would close both. It
is not done here because it would start sending mail from a deployment whose
operator has not asked for that, and the delivery Worker is billed per message.

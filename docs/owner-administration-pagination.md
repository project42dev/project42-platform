# Owner administration pagination

The reusable account API exposes bounded, cursor-paginated owner queries for
accounts and audit events:

- `GET /v1/admin/accounts`
- `GET /v1/admin/audit`

Both routes require an authenticated, approved account with the installation's
`owner` role. Authorization is evaluated before pagination parameters or cursors
are processed. A cursor never grants access and is not accepted as identity or
authorization evidence.

## Request contract

Both routes accept:

| Parameter | Meaning |
| --- | --- |
| `pageSize` | Optional integer from 1 through 100. The default is 50. |
| `cursor` | Optional opaque continuation value from the preceding response. |

Account listing also retains its optional `state` filter:

```text
GET /v1/admin/accounts?state=pending&pageSize=50
```

Use the same route, installation, and filter values when following a cursor.
Duplicate parameters, an out-of-range page size, an altered cursor, a cursor
from another installation, or a cursor from a different filter returns `400`.
Clients must not parse, construct, store as authority, or make assumptions about
cursor contents.

## Response contract

The existing top-level `accounts` and `events` arrays remain in place. A new
`page` member supplies continuation information:

```json
{
  "accounts": [],
  "page": {
    "pageSize": 50,
    "returnedCount": 0,
    "hasMore": false,
    "nextCursor": null
  }
}
```

Audit responses use the same `page` shape with an `events` array. When
`hasMore` is `true`, request the next page with the exact `nextCursor` value.
When it is `false`, `nextCursor` is `null`.

Consumers that previously read only `accounts` or `events` remain compatible
for small result sets, but must adopt continuation to prove that a larger
installation has been fully reviewed. The API intentionally does not offer an
unbounded compatibility mode.

## Ordering and consistency

Account pages use ascending `(createdAt, id)` keyset order. Audit pages use the
database's unique audit sequence in descending order, so the newest recorded
event is returned first. Both queries fetch at most `pageSize + 1` tenant-scoped
rows to determine whether another page exists.

The cursor is deterministic traversal state protected by a format and integrity
digest and bound to its installation, query kind, and account-state filter. It
is not an authorization boundary. Approved-owner authorization and
installation-scoped SQL remain the security boundaries. The same SQL and cursor
contract runs through the Cloudflare D1 adapter and the PostgreSQL compatibility
adapter.

## Client migration

1. Keep reading the existing `accounts` or `events` array.
2. Read `page.hasMore`.
3. If true, repeat the same request with `page.nextCursor`.
4. Append results while rejecting duplicate IDs client-side.
5. Stop only when `hasMore` is false.
6. Discard a cursor after changing the account-state filter, installation, or
   signed-in owner context.

The administration UI should expose explicit previous/next or load-more
controls, announce newly loaded results, retain keyboard focus, and never infer
that the first page is the full administrative record.

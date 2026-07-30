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

The cursor contains traversal state encrypted and authenticated with AES-GCM.
The service derives a purpose-specific cursor key from the deployment's
`SESSION_ENCRYPTION_KEY`; plaintext installation, query-kind, filter, and
position values are not exposed to clients. The authenticated payload remains
bound to its installation, query kind, and account-state filter. It is not an
authorization boundary. Approved-owner authorization and installation-scoped
SQL remain the security boundaries. The same SQL and cursor contract runs
through the Cloudflare D1 adapter and the PostgreSQL compatibility adapter.

Rotating `SESSION_ENCRYPTION_KEY` intentionally invalidates outstanding
continuation values. Clients treat the resulting `invalid_admin_cursor`
response as stale-page state, discard the cursor, and restart from the first
page. The local evaluation profile can use a process-scoped ephemeral cursor
key, but every production and secure self-host deployment supplies the stable
secret-backed key already required for API-owned browser sessions.

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

## Scalability and query-plan gates

Hosted D1 migration `0015_admin_pagination_indexes.sql` and self-hosted
PostgreSQL migration `012_admin_pagination_indexes.sql` add matching composite
indexes for the complete account sort key, the optional account-state filter,
and descending audit sequence. Account-role aggregation is correlated to each
bounded account row so the database does not materialize every role assignment
before applying the page limit.

The automated scale fixture creates two installations with more than 1,200
accounts and 1,800 audit events each. It traverses every target-installation
page, including repeated account timestamps and a state-filtered traversal, and
rejects missing rows, duplicate rows, ordering drift, or cross-installation
leakage. D1 explains the exact production statements and must select the
matching composite indexes without a temporary order B-tree. When
`TEST_POSTGRES_URL` is available, the same large fixture and JSON query-plan
checks run against PostgreSQL.

These checks are deterministic regression gates, not a wall-clock latency
service-level objective. Production promotion still requires authenticated
owner-console validation and environment-specific capacity evidence.

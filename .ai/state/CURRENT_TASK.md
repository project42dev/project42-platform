# Current task

Complete the platform-only scalability and query-plan portion of AB#6358,
"Add paginated account and audit administration queries."

The reusable platform already exposes cursor-paginated, tenant-scoped account
and audit queries. This branch adds complete keyset indexes, keeps the existing
opaque cursor contract unchanged, removes whole-table role materialization from
the account query, and proves traversal and query-plan behavior with large,
two-tenant fixtures.

AB#6358 is Active. Do not move it to Resolved or Closed until the remaining
authenticated production owner-console validation is complete.

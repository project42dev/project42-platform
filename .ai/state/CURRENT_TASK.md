# Current task

Implement the backend registration and authorization boundary for AB#5695 and
AB#5697: provider-neutral account requests with a limited status receipt,
approved-only learner browser sessions, stale-session revocation, and atomic
owner account-state decisions across Cloudflare D1 and PostgreSQL. Close the
follow-up security review by enforcing an explicit non-approved bearer
allowlist and single-use registration-receipt lifecycle across every account
state and protected learner route.

AB#5695 and AB#5697 remain Active until the Learn UI, cross-repository
integration, production deployment, and production evidence are complete.

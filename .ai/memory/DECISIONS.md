# Decisions

- Identity keys are immutable OIDC issuer-and-subject pairs; email is profile and
  exact-domain policy data, never an identity key.
- `rejected` is reversible; `revoked` is terminal.
- Sensitive export and deletion actions require authentication issued within 15
  minutes.
- Deletion has a seven-day cancellation window and retains only governed audit
  evidence and a pseudonymous subject tombstone.
- Public code remains provider-neutral and contains no hosted deployment IDs.

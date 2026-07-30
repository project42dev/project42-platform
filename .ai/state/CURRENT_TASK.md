# Current task

Fix the AB#6437 production browser-sign-in failure using the concrete
`ERR_JWT_EXPIRED` callback evidence without weakening ID-token validation.

Expired provider ID tokens must continue to fail closed. A browser callback
with that exact failure should clear the one-time transaction cookie, return
the learner to the normalized Learn target with a restartable generic error
state, and emit only privacy-safe diagnostics.

Do not perform a release, deployment, database mutation, identity-provider
mutation, or Azure DevOps state transition from this branch. AB#6437 remains
Active until the current Worker is deployed and a fresh real login succeeds.

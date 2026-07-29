# Alternative agent runtime mapping

Any runtime can satisfy the lab when it preserves the portable contracts for
inputs, outputs, identities, tools, state, memory, telemetry, evaluation, and
recovery.

The implementation may use a local loop, containerized orchestration framework,
managed agent platform, durable workflow engine, or a custom service. It must
still prove:

- explicit caller, operator, workload, model, and tool authority;
- allowlisted tool schemas, targets, arguments, deadlines, retry policy, and
  `success`, `failure`, or `unknown` results;
- durable versioned state, checkpoints, idempotency, memory policy, retention,
  deletion, and reconciliation;
- bounded turns, tokens, requests, time, retries, concurrency, and cost;
- correlated secret-safe telemetry and terminal outcomes;
- representative routine, denied, adversarial, failure, restart, and recovery
  cases;
- no duplicate effect after an unknown tool outcome and runtime restart.

If a managed platform hides state or tool results, export enough evidence to
reproduce the terminal disposition. If it cannot provide that evidence or cannot
enforce the human authority boundary, it does not satisfy the lab.

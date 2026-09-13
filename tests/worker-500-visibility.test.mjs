// AB#6167: the worker's catch-all turned every unhandled error into a bare
// 500 and discarded the error's name/message/stack, so a D1 CHECK-constraint
// failure on progress_imports was invisible in Workers Logs for weeks - an
// operator had a request id and nothing else to go on.
//
// This gates three things at once:
//   1. An unrecognized error's name/message/stack now reach the structured
//      console.error log (so `wrangler tail` shows what broke), while the
//      client response still carries only a generic message and the
//      request id - never the error's own message/stack. Revert the
//      routePatternFor/internalErrorLogDetail wiring in src/worker.ts and
//      "an unrecognized error's name/message/stack reach the log but never
//      the client" and "a scheduled purge failure is logged with its error
//      name/message/stack" fail: the log line goes back to carrying only
//      { level, requestId, method, path, status, code } (fetch path) or
//      nothing at all (scheduled path - the rejection is simply swallowed).
//   2. The log itself never carries the request's raw query string, cookie
//      header, authorization header, or a caller-supplied email - only
//      method, a route *pattern* (dynamic segments collapsed), and the
//      error's own name/message/stack.
//   3. Even the error's own message/stack are redacted before logging, in
//      case the underlying error (a D1 driver error, a third-party client)
//      echoes back a token, cookie, or other secret-shaped substring. Stub
//      redactSensitive() to the identity function in src/worker.ts and
//      "redactSensitive scrubs common secret shapes..." and the redaction
//      assertions in the first test fail.
import assert from "node:assert/strict";
import test from "node:test";
import worker, { handleRequest, redactSensitive } from "../dist/worker.js";

const origin = "https://learn.example.test";
const installationId = "worker-500-visibility";

function captureConsoleError(t) {
  const lines = [];
  const original = console.error;
  console.error = (line) => lines.push(line);
  t.after(() => {
    console.error = original;
  });
  return {
    lines,
    parsed: () =>
      lines.flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      }),
  };
}

// A repository whose very first call (ensureInstallation, awaited before any
// route is matched) throws an unrecognized error. This reaches the outer
// catch-all as an error that is not an ApiFailure/InvalidAdminCursorError/
// InvalidAdminPageSizeError, exactly the "we don't recognize this" branch
// the fix targets.
function throwingRepository(error) {
  return {
    ensureInstallation: async () => {
      throw error;
    },
  };
}

test("an unrecognized error's name/message/stack reach the log but never the client", async (t) => {
  const capture = captureConsoleError(t);
  // Deliberately shaped like the real-world failure this bug hid: a message
  // that would be sensitive if it ever reached a client, standing in for a
  // D1 driver error that happens to echo back part of the offending row.
  const secretMessage =
    "CHECK constraint failed: token=sk-live-51H8xLdKX9pQ2vR cookie=session=a1b2c3d4e5f6";
  const thrown = new Error(secretMessage);
  const env = {
    PROJECT42_DB: {},
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: origin,
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };

  const response = await handleRequest(
    new Request(`https://api.example.test/v1/session?token=request-query-secret-999`, {
      method: "POST",
      headers: {
        origin,
        authorization: "Bearer request-auth-secret-888",
        cookie: "session=request-cookie-secret-777",
      },
    }),
    env,
    { verify: async () => { throw new Error("unused"); } },
    throwingRepository(thrown),
  );

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error.code, "internal_error");
  assert.ok(typeof body.error.requestId === "string" && body.error.requestId.length > 0);
  // The client must never see the underlying error's own message/stack.
  assert.ok(!body.error.message.includes("sk-live"));
  assert.ok(!body.error.message.includes("cookie="));
  assert.equal(body.error.message, "The request could not be completed.");
  assert.ok(!JSON.stringify(body).includes(secretMessage));

  const [entry] = capture.parsed();
  assert.ok(entry, `expected a parseable JSON log line, got: ${capture.lines.join("\n")}`);
  // This is the part that is invisible without the fix: the operator-facing
  // log must carry what broke, with the diagnostic text intact...
  assert.equal(entry.errorName, "Error");
  assert.match(entry.errorMessage, /CHECK constraint failed/);
  assert.ok(typeof entry.errorStack === "string" && entry.errorStack.length > 0);
  assert.equal(entry.method, "POST");
  assert.equal(entry.status, 500);
  assert.equal(entry.code, "internal_error");
  assert.equal(entry.requestId, body.error.requestId);

  // ...but the token-like string and the cookie value the thrown error's own
  // message carried must never reach the log verbatim: internalErrorLogDetail
  // redacts them before they are serialized, the same as it would redact a
  // real D1 error that happened to echo back part of the offending row.
  const serializedEntry = JSON.stringify(entry);
  assert.ok(!serializedEntry.includes("sk-live-51H8xLdKX9pQ2vR"));
  assert.ok(!serializedEntry.includes("a1b2c3d4e5f6"));
  assert.ok(serializedEntry.includes("[redacted]"));

  // Nothing from the request's own query string, cookie, or bearer token
  // leaked into the log under any key either.
  assert.ok(!serializedEntry.includes("request-query-secret-999"));
  assert.ok(!serializedEntry.includes("request-cookie-secret-777"));
  assert.ok(!serializedEntry.includes("request-auth-secret-888"));
});

test("redactSensitive scrubs common secret shapes without eating the useful text", () => {
  const cases = [
    ["Authorization: Bearer abcdef123456", "Bearer"],
    ["token=sk-live-51H8xLdKX9pQ2vR", "sk-live"],
    ["cookie: session=a1b2c3d4e5f6a1b2c3d4e5f6", "session="],
    ["contact learner@example.test for help", "@example.test"],
    ["digest ff11ffffffffffffffffffffffffffff", "ff11ffff"],
  ];
  for (const [input, mustNotAppear] of cases) {
    const output = redactSensitive(input);
    assert.ok(
      !output.includes(mustNotAppear),
      `expected redactSensitive(${JSON.stringify(input)}) to scrub ${JSON.stringify(mustNotAppear)}, got ${JSON.stringify(output)}`,
    );
    assert.ok(output.includes("[redacted]"), `expected a [redacted] marker in ${JSON.stringify(output)}`);
  }

  // The diagnostic text a real D1 error carries must survive redaction -
  // this is the whole point of logging the error at all.
  assert.match(
    redactSensitive("CHECK constraint failed: progress_imports.status"),
    /CHECK constraint failed: progress_imports\.status/,
  );

  // A stack frame naming a long, pure-alpha class (no digits) must survive
  // verbatim - the 32+ character catch-all is for opaque tokens/digests, not
  // for this codebase's own identifiers.
  const frame = "at ServiceBindingAccountNotificationAdapter.fetch (worker.js:1)";
  assert.equal(redactSensitive(frame), frame);
});

test("the logged route is a pattern, not the raw path with caller-supplied ids", async (t) => {
  const capture = captureConsoleError(t);
  const thrown = new Error("boom");
  const env = {
    PROJECT42_DB: {},
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: origin,
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };
  const mergeCaseId = "a-caller-chosen-merge-case-id-123";

  await handleRequest(
    new Request(
      `https://api.example.test/v1/me/account-merges/${mergeCaseId}/complete`,
      { method: "POST", headers: { origin } },
    ),
    env,
    { verify: async () => { throw new Error("unused"); } },
    throwingRepository(thrown),
  );

  const [entry] = capture.parsed();
  assert.ok(entry);
  assert.equal(entry.route, "/v1/me/account-merges/:id/complete");
  assert.ok(!JSON.stringify(entry).includes(mergeCaseId));
});

test("a caller-supplied domain name in the path is also collapsed, not logged verbatim", async (t) => {
  const capture = captureConsoleError(t);
  const thrown = new Error("boom");
  const env = {
    PROJECT42_DB: {},
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: origin,
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };
  // /v1/admin/domains/([^/]+) takes a caller-supplied domain, not a route
  // word - a lowercase-and-dot allowance in routePatternFor would have let
  // this one through verbatim, since a domain name looks exactly like the
  // one legitimate dotted literal (transcript.csv).
  const domain = "example.com";

  await handleRequest(
    new Request(`https://api.example.test/v1/admin/domains/${domain}`, {
      method: "DELETE",
      headers: { origin },
    }),
    env,
    { verify: async () => { throw new Error("unused"); } },
    throwingRepository(thrown),
  );

  const [entry] = capture.parsed();
  assert.ok(entry);
  assert.equal(entry.route, "/v1/admin/domains/:id");
  assert.ok(!JSON.stringify(entry).includes(domain));
});

test("a recognized ApiFailure is not treated as an unrecognized internal error", async (t) => {
  const capture = captureConsoleError(t);
  const env = {
    PROJECT42_DB: {},
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: origin,
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };

  // A disallowed Origin header triggers the worker's own
  // ApiFailure(403, "origin_not_allowed", ...) - an intentional, client-safe
  // error that must not be mistaken for the unrecognized-error branch.
  const response = await handleRequest(
    new Request("https://api.example.test/v1/session", {
      method: "POST",
      headers: { origin: "https://not-allowed.example.test" },
    }),
    env,
    { verify: async () => { throw new Error("unused"); } },
  );

  assert.equal(response.status, 403);
  const [entry] = capture.parsed();
  assert.ok(entry);
  assert.equal(entry.code, "origin_not_allowed");
  assert.equal(entry.errorName, undefined);
  assert.equal(entry.errorMessage, undefined);
  assert.equal(entry.errorStack, undefined);
});

// scheduled() has the identical failure mode: ctx.waitUntil swallows a
// rejected promise with no structure an operator can act on. A D1 failure
// in one of the two retention purges must land the same kind of
// requestId-tagged, name/message/stack-bearing log line as the fetch path,
// and must not take the other scheduled tasks down with it.
async function runScheduledTick(env) {
  const pending = [];
  worker.scheduled(
    { scheduledTime: Date.now(), cron: "17 3 * * *", noRetry() {} },
    env,
    { waitUntil: (promise) => pending.push(promise), passThroughOnException() {} },
  );
  await Promise.all(pending);
}

function throwingD1(message) {
  return {
    prepare: () => ({
      bind: () => ({
        run: async () => {
          throw new Error(message);
        },
      }),
    }),
  };
}

test("a scheduled purge failure is logged with its error name/message/stack", async (t) => {
  const capture = captureConsoleError(t);
  const env = {
    PROJECT42_DB: throwingD1("D1_ERROR: CHECK constraint failed on audit_events"),
    INSTALLATION_ID: installationId,
  };

  await runScheduledTick(env);

  const entries = capture.parsed();
  const auditFailure = entries.find(
    (entry) => entry.action === "audit-detail.scheduled-purge",
  );
  assert.ok(auditFailure, `expected an audit-detail.scheduled-purge log entry, got: ${capture.lines.join("\n")}`);
  assert.equal(auditFailure.code, "audit_detail_scheduled_purge_failed");
  assert.equal(auditFailure.errorName, "Error");
  assert.match(auditFailure.errorMessage, /CHECK constraint failed on audit_events/);
  assert.ok(typeof auditFailure.errorStack === "string" && auditFailure.errorStack.length > 0);
  assert.ok(typeof auditFailure.requestId === "string" && auditFailure.requestId.length > 0);

  // The sibling purge shares the same broken PROJECT42_DB and must fail
  // independently and just as visibly - one broken task must not silence
  // or block the others.
  const deletionFailure = entries.find(
    (entry) => entry.action === "deletion-receipt.scheduled-purge",
  );
  assert.ok(deletionFailure, "expected a deletion-receipt.scheduled-purge log entry too");
  assert.equal(deletionFailure.code, "deletion_receipt_scheduled_purge_failed");
  assert.match(deletionFailure.errorMessage, /CHECK constraint failed on audit_events/);
});

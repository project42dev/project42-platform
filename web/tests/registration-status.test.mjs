import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRegistrationStatus,
  readBrowserAuthOutcome,
  registrationRetryDelaySeconds,
} from "../app/lib/registrationStatus.ts";

const requestedAt = "2026-07-29T10:00:00.000Z";
const updatedAt = "2026-07-29T10:05:00.000Z";

test("reduces registration status to the platform PII-free allowlist", () => {
  const status = parseRegistrationStatus({
    registration: {
      state: "pending",
      requestedAt,
      updatedAt,
      canSignIn: false,
      nextAction: "await-review",
      primaryEmail: "must-not-render@example.test",
      subject: "must-not-render",
    },
    requestId: "transport-only",
  });

  assert.deepEqual(status, {
    state: "pending",
    requestedAt,
    updatedAt,
    canSignIn: false,
    nextAction: "await-review",
  });
  assert.doesNotMatch(JSON.stringify(status), /example\.test|subject|requestId/);
});

test("accepts only internally consistent approved and rejected status", () => {
  assert.deepEqual(
    parseRegistrationStatus({
      registration: {
        state: "approved",
        requestedAt,
        updatedAt,
        canSignIn: true,
        nextAction: "sign-in",
      },
    }),
    {
      state: "approved",
      requestedAt,
      updatedAt,
      canSignIn: true,
      nextAction: "sign-in",
    },
  );
  assert.deepEqual(
    parseRegistrationStatus({
      registration: {
        state: "rejected",
        requestedAt,
        updatedAt,
        canSignIn: false,
        nextAction: "contact-owner",
      },
    }),
    {
      state: "rejected",
      requestedAt,
      updatedAt,
      canSignIn: false,
      nextAction: "contact-owner",
    },
  );
});

test("fails closed on unsafe state, timestamp, and next-action drift", () => {
  const invalid = [
    null,
    {},
    { registration: null },
    {
      registration: {
        state: "unknown-future-state",
        requestedAt,
        updatedAt,
        canSignIn: false,
        nextAction: "contact-owner",
      },
    },
    // Suspended and revoked are real reported states, but they must still fail
    // closed if the server claims they can sign in.
    {
      registration: {
        state: "suspended",
        requestedAt,
        updatedAt,
        canSignIn: true,
        nextAction: "contact-owner",
      },
    },
    {
      registration: {
        state: "revoked",
        requestedAt,
        updatedAt,
        canSignIn: false,
        nextAction: "sign-in",
      },
    },
    {
      registration: {
        state: "pending",
        requestedAt,
        updatedAt,
        canSignIn: true,
        nextAction: "await-review",
      },
    },
    {
      registration: {
        state: "pending",
        requestedAt,
        updatedAt,
        canSignIn: false,
        nextAction: "contact-owner",
      },
    },
    {
      registration: {
        state: "pending",
        requestedAt: "not-a-date",
        updatedAt,
        canSignIn: false,
        nextAction: "await-review",
      },
    },
    {
      registration: {
        state: "pending",
        requestedAt: updatedAt,
        updatedAt: requestedAt,
        canSignIn: false,
        nextAction: "await-review",
      },
    },
  ];

  for (const value of invalid) {
    assert.throws(
      () => parseRegistrationStatus(value),
      /invalid_registration_status/,
    );
  }
});

test("accepts one known browser auth outcome and rejects ambiguous input", () => {
  for (const outcome of [
    "success",
    "pending",
    "rejected",
    "unavailable",
    "error",
  ]) {
    assert.equal(readBrowserAuthOutcome(`?auth=${outcome}`), outcome);
  }
  assert.equal(readBrowserAuthOutcome(""), null);
  assert.equal(readBrowserAuthOutcome("?auth=pending&auth=rejected"), "invalid");
  assert.equal(readBrowserAuthOutcome("?auth=unknown"), "invalid");
});

test("bounds numeric, date, missing, and hostile Retry-After values", () => {
  const now = Date.parse("2026-07-29T10:00:00.000Z");
  assert.equal(registrationRetryDelaySeconds("120", now), 120);
  assert.equal(registrationRetryDelaySeconds("1", now), 10);
  assert.equal(registrationRetryDelaySeconds("9999", now), 300);
  assert.equal(
    registrationRetryDelaySeconds("Wed, 29 Jul 2026 10:01:30 GMT", now),
    90,
  );
  assert.equal(registrationRetryDelaySeconds(null, now), 30);
  assert.equal(registrationRetryDelaySeconds("not-a-delay", now), 30);
});

test("suspended and revoked receipts parse with an accurate, non-signable status", () => {
  // The server reports every account state on this receipt. Rejecting suspended
  // and revoked collapsed an accurate status into a generic "unavailable"
  // error for exactly the learners who most need to know what happened to
  // their access (AB#5780).
  for (const state of ["suspended", "revoked"]) {
    const receipt = parseRegistrationStatus({
      registration: {
        state,
        requestedAt,
        updatedAt,
        canSignIn: false,
        nextAction: "contact-owner",
      },
    });
    assert.equal(receipt.state, state);
    assert.equal(receipt.canSignIn, false);
    assert.equal(receipt.nextAction, "contact-owner");
  }
});

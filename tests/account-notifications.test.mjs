import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_NOTIFICATION_KINDS,
  AccountNotificationDeliveryError,
  DeterministicAccountNotificationAdapter,
  DisabledAccountNotificationAdapter,
  accountNotificationRetryDelaySeconds,
  normalizeAccountNotificationDeliveryError,
  renderAccountNotification,
} from "../dist/index.js";

test("account notification templates are accessible and contain minimum data", () => {
  for (const kind of ACCOUNT_NOTIFICATION_KINDS) {
    const rendered = renderAccountNotification(kind);
    assert.ok(rendered.subject.length > 0);
    assert.match(rendered.text, /Project 42|Account|account/);
    assert.match(rendered.html, /^<!doctype html>/);
    assert.match(rendered.html, /<html lang="en">/);
    assert.match(rendered.html, /<main><h1>/);
    assert.doesNotMatch(rendered.html, /<img|<style|tracking|pixel/i);
    assert.doesNotMatch(
      `${rendered.subject}${rendered.text}${rendered.html}`,
      /@|https?:\/\//,
    );
  }
});

test("deterministic and disabled adapters implement the provider-neutral contract", async () => {
  const message = {
    contractVersion: "1.0",
    notificationId: "notification-1",
    kind: "learner-approved",
    recipient: "learner@example.test",
    ...renderAccountNotification("learner-approved"),
  };
  const deterministic = new DeterministicAccountNotificationAdapter(
    "2026-07-29T12:00:00.000Z",
  );
  assert.deepEqual(await deterministic.deliver(message), {
    acceptedAt: "2026-07-29T12:00:00.000Z",
  });
  assert.deepEqual(deterministic.deliveries, [message]);
  await assert.rejects(
    new DisabledAccountNotificationAdapter().deliver(message),
    (error) =>
      error instanceof AccountNotificationDeliveryError &&
      error.code === "delivery-not-configured" &&
      error.retryable,
  );
});

test("account notification retry policy is bounded and adapter errors are sanitized", () => {
  assert.equal(accountNotificationRetryDelaySeconds(1), 60);
  assert.equal(accountNotificationRetryDelaySeconds(2), 120);
  assert.equal(accountNotificationRetryDelaySeconds(7), 3600);
  assert.equal(accountNotificationRetryDelaySeconds(100), 3600);
  assert.throws(() => accountNotificationRetryDelaySeconds(0), /positive integer/);

  const normalized = normalizeAccountNotificationDeliveryError(
    new Error("private vendor response with learner@example.test"),
  );
  assert.equal(normalized.code, "delivery-temporary-failure");
  assert.doesNotMatch(normalized.message, /vendor|@/);
});

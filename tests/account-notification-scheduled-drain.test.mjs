import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import worker, {
  D1Project42Repository,
  drainOwnerAccountNotifications,
} from "../dist/worker.js";

// The scheduled tick is the only thing that tells an owner a request exists.
// Everything below is about the two ways that can go wrong without anybody
// noticing: sending nothing, and sending a learner the mail /account promised
// would never arrive.

async function applyD1Migrations(database) {
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
}

function verifiedIdentity(subject, email) {
  return {
    provider: "oidc",
    issuer: "https://identity.example.test",
    subject,
    email,
    emailVerified: true,
    displayName: subject,
    authenticatedAt: 1785326400,
  };
}

function recordingDeliveryBinding(respond = () => new Response(null, { status: 202 })) {
  const deliveries = [];
  return {
    deliveries,
    binding: {
      async fetch(request) {
        deliveries.push(await request.json());
        return respond();
      },
    },
  };
}

function captureConsole(t) {
  const info = [];
  const errors = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (line) => info.push(line);
  console.error = (line) => errors.push(line);
  t.after(() => {
    console.info = originalInfo;
    console.error = originalError;
  });
  return {
    info,
    errors,
    parsed: (lines) =>
      lines.flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      }),
  };
}

// The worker's scheduled() handler is fire-and-forget: it hands work to
// waitUntil and returns. A test that does not await those promises proves
// nothing, so the fake context keeps them.
async function runScheduledTick(env) {
  const pending = [];
  worker.scheduled(
    { scheduledTime: Date.now(), cron: "17 3 * * *", noRetry() {} },
    env,
    { waitUntil: (promise) => pending.push(promise), passThroughOnException() {} },
  );
  await Promise.all(pending);
}

// A pending learner whose request is real, plus the approved owner who is owed
// the alert. Seeded at the current clock because scheduled() reads the real one
// and an owner alert is only deliverable while the request is unexpired.
async function seedPendingRequest(database, installationId, now) {
  const repository = new D1Project42Repository(database, installationId);
  await repository.ensureInstallation(now);
  const ownerIdentity = verifiedIdentity("owner", "owner@example.test");
  const learnerIdentity = verifiedIdentity("learner", "learner@example.test");
  const owner = await repository.createOrRefreshAccount(
    ownerIdentity,
    true,
    "owner-bootstrap",
    now,
  );
  const learner = await repository.createOrRefreshAccount(
    learnerIdentity,
    false,
    "learner-signup",
    now,
  );
  await repository.createRegistrationRequest({
    account: learner,
    identity: learnerIdentity,
    receiptTokenDigest: "a".repeat(64),
    requestId: "registration-request",
    now,
  });
  return { repository, owner, learner };
}

async function readNotifications(database, installationId) {
  const rows = await database
    .prepare(
      `SELECT id, kind, state, attempt_count, lease_token, delivered_at,
              available_at, updated_at, last_error_code
         FROM account_notifications
        WHERE installation_id = ?
        ORDER BY kind, created_at, id`,
    )
    .bind(installationId)
    .all();
  return rows.results;
}

async function miniflareDatabase(t, name) {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: name },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  return database;
}

test("a scheduled tick delivers the owner alert exactly once", async (t) => {
  const installationId = "scheduled-drain-once";
  const database = await miniflareDatabase(t, "project42-scheduled-drain-once");
  const now = new Date().toISOString();
  await seedPendingRequest(database, installationId, now);

  const delivery = recordingDeliveryBinding();
  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
    ACCOUNT_NOTIFICATION_DELIVERY: delivery.binding,
  };

  await runScheduledTick(env);
  assert.equal(delivery.deliveries.length, 1);
  assert.equal(delivery.deliveries[0].kind, "owner-registration-alert");
  assert.equal(delivery.deliveries[0].recipient, "owner@example.test");

  const afterFirst = await readNotifications(database, installationId);
  const ownerRow = afterFirst.find(
    (row) => row.kind === "owner-registration-alert",
  );
  assert.equal(ownerRow.state, "delivered");
  assert.equal(ownerRow.attempt_count, 1);
  assert.equal(ownerRow.lease_token, null);

  // A cron fires again tomorrow whether or not anything changed.
  await runScheduledTick(env);
  assert.equal(delivery.deliveries.length, 1);
  const afterSecond = await readNotifications(database, installationId);
  assert.deepEqual(
    afterSecond.find((row) => row.kind === "owner-registration-alert"),
    ownerRow,
  );
});

test("the scheduled tick never sends a learner-directed notification", async (t) => {
  const installationId = "scheduled-drain-learner";
  const database = await miniflareDatabase(
    t,
    "project42-scheduled-drain-learner",
  );
  const now = new Date().toISOString();
  const { repository, owner } = await seedPendingRequest(
    database,
    installationId,
    now,
  );
  // A second learner who has already been decided, so the outbox holds a
  // learner decision notification as well as a learner receipt.
  const secondIdentity = verifiedIdentity("learner-two", "two@example.test");
  const second = await repository.createOrRefreshAccount(
    secondIdentity,
    false,
    "learner-two-signup",
    now,
  );
  await repository.createRegistrationRequest({
    account: second,
    identity: secondIdentity,
    receiptTokenDigest: "b".repeat(64),
    requestId: "registration-request-two",
    now,
  });
  await repository.changeAccountState({
    actor: owner,
    targetId: second.id,
    to: "approved",
    reason: "Approved after owner review.",
    requestId: "approve-second-learner",
    now,
  });

  // A learner row abandoned mid-delivery by some earlier owner-initiated
  // dispatch. Lease recovery rewrites state and last_error_code, so an
  // unfiltered drain would touch it even though it never sends it.
  const abandoned = (await readNotifications(database, installationId)).find(
    (row) => row.kind === "registration-receipt",
  );
  await database
    .prepare(
      `UPDATE account_notifications
          SET state = 'delivering', attempt_count = 1,
              lease_token = 'abandoned-lease',
              lease_expires_at = ?, updated_at = ?
        WHERE installation_id = ? AND id = ?`,
    )
    .bind("2000-01-01T00:00:00.000Z", now, installationId, abandoned.id)
    .run();

  const before = await readNotifications(database, installationId);
  const learnerRowsBefore = before.filter(
    (row) => row.kind !== "owner-registration-alert",
  );
  assert.equal(
    before.find((row) => row.id === abandoned.id).state,
    "delivering",
  );
  assert.deepEqual(
    learnerRowsBefore.map((row) => row.kind).sort(),
    ["learner-approved", "registration-receipt", "registration-receipt"],
  );

  const delivery = recordingDeliveryBinding();
  // The second learner's own owner alert dead-letters as recipient-ineligible
  // -- that decision has already been made, so there is nothing left to
  // review -- and the drain logs that at error level. Expected, and unrelated
  // to what this test asserts.
  await runScheduledTick({
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
    ACCOUNT_NOTIFICATION_DELIVERY: delivery.binding,
  });

  assert.ok(delivery.deliveries.length > 0, "the owner alert must still be sent");
  for (const message of delivery.deliveries) {
    assert.equal(message.kind, "owner-registration-alert");
  }
  const after = await readNotifications(database, installationId);
  const learnerRowsAfter = after.filter(
    (row) => row.kind !== "owner-registration-alert",
  );
  // Not sent, not claimed, not marked, not deleted: byte-identical rows.
  assert.deepEqual(learnerRowsAfter, learnerRowsBefore);
  for (const row of learnerRowsAfter) {
    assert.equal(row.delivered_at, null);
  }
  const stillAbandoned = after.find((row) => row.id === abandoned.id);
  assert.equal(stillAbandoned.state, "delivering");
  assert.equal(stillAbandoned.lease_token, "abandoned-lease");
  assert.equal(stillAbandoned.last_error_code, null);
});

test("an unconfigured deployment is a logged no-op", async (t) => {
  const installationId = "scheduled-drain-unconfigured";
  const database = await miniflareDatabase(
    t,
    "project42-scheduled-drain-unconfigured",
  );
  const now = new Date().toISOString();
  await seedPendingRequest(database, installationId, now);
  const before = await readNotifications(database, installationId);

  const logs = captureConsole(t);
  await runScheduledTick({
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
  });

  const noop = logs
    .parsed(logs.info)
    .filter(
      (entry) => entry.action === "account-notification.scheduled-drain",
    );
  assert.equal(noop.length, 1);
  assert.equal(noop[0].level, "info");
  assert.equal(
    noop[0].code,
    "account_notification_delivery_not_configured",
  );
  // A deployment that never set up mail must not raise an error every tick.
  assert.deepEqual(logs.errors, []);
  assert.deepEqual(await readNotifications(database, installationId), before);
});

test("a broken outbox read is logged, not thrown into the tick", async (t) => {
  const logs = captureConsole(t);
  const broken = {
    prepare() {
      throw new Error("D1_ERROR: no such table: account_notifications");
    },
  };
  const summary = await drainOwnerAccountNotifications(
    {
      PROJECT42_DB: broken,
      INSTALLATION_ID: "scheduled-drain-broken",
      ACCOUNT_NOTIFICATION_DELIVERY: recordingDeliveryBinding().binding,
    },
    new Date().toISOString(),
    "broken-outbox",
  );
  assert.equal(summary, null);
  const failures = logs
    .parsed(logs.errors)
    .filter(
      (entry) => entry.action === "account-notification.scheduled-drain",
    );
  assert.equal(failures.length, 1);
  assert.equal(
    failures[0].code,
    "account_notification_scheduled_drain_failed",
  );
  assert.equal(failures[0].requestId, "broken-outbox");
});

test("a delivery failure leaves the row pending, logged, and bounded", async (t) => {
  const installationId = "scheduled-drain-failure";
  const database = await miniflareDatabase(
    t,
    "project42-scheduled-drain-failure",
  );
  const start = Date.now();
  const at = (seconds) => new Date(start + seconds * 1000).toISOString();
  await seedPendingRequest(database, installationId, at(0));

  const delivery = recordingDeliveryBinding(
    () => new Response(null, { status: 500 }),
  );
  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
    ACCOUNT_NOTIFICATION_DELIVERY: delivery.binding,
  };

  const logs = captureConsole(t);
  // A failing delivery must not throw out of the tick: the retention purges
  // share it.
  await runScheduledTick(env);
  const incomplete = logs
    .parsed(logs.errors)
    .filter(
      (entry) => entry.action === "account-notification.scheduled-drain",
    );
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].level, "error");
  assert.equal(
    incomplete[0].code,
    "account_notification_scheduled_drain_incomplete",
  );
  assert.equal(incomplete[0].retryable, 1);

  const afterFailure = (await readNotifications(database, installationId)).find(
    (row) => row.kind === "owner-registration-alert",
  );
  assert.equal(afterFailure.state, "retryable");
  assert.equal(afterFailure.attempt_count, 1);
  assert.equal(afterFailure.lease_token, null);
  assert.equal(afterFailure.delivered_at, null);
  assert.equal(afterFailure.last_error_code, "delivery-temporary-failure");
  assert.ok(afterFailure.available_at > at(0));

  // Retries are bounded. Walk the whole backoff with an injected clock, each
  // run at the moment the row itself says it is next due, and the row must
  // stop rather than retry for ever.
  for (let attempt = 2; attempt <= 5; attempt += 1) {
    const due = (await readNotifications(database, installationId)).find(
      (row) => row.kind === "owner-registration-alert",
    );
    await drainOwnerAccountNotifications(env, due.available_at, `retry-${attempt}`);
  }
  const exhausted = (await readNotifications(database, installationId)).find(
    (row) => row.kind === "owner-registration-alert",
  );
  assert.equal(exhausted.state, "dead-letter");
  assert.equal(exhausted.attempt_count, 5);
  assert.equal(delivery.deliveries.length, 5);

  await drainOwnerAccountNotifications(env, at(86_400), "retry-tomorrow");
  assert.equal(delivery.deliveries.length, 5);
  const stillDead = (await readNotifications(database, installationId)).find(
    (row) => row.kind === "owner-registration-alert",
  );
  assert.deepEqual(stillDead, exhausted);
});

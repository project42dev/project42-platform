import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  createLearningRecordDeletionReceipt,
  createLearningRecordDeletionReplay,
  createVerifiedLearningRecordExport,
  verifyLearningRecordDeletionReceipt,
  verifyLearningRecordDeletionReplay,
  verifyLearningRecordExport,
} from "../dist/index.js";

const events = [
  {
    schemaVersion: "1.0",
    id: "learning-event-example-1",
    sequence: 1,
    type: "path.enrolled",
    installationId: "receipt-installation",
    learnerId: "receipt-learner",
    idempotencyKey: "receipt-command-example-0001",
    contentVersion: "1.0.0",
    commandDigest:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    occurredAt: "2026-07-28T12:00:00.000Z",
    recordedAt: "2026-07-28T12:00:01.000Z",
    actor: { type: "learner", userId: "receipt-learner" },
    payload: {
      pathId: "foundations",
      pathTitle: "Foundations",
      moduleIds: ["module-1"],
      badge: {
        id: "badge-1",
        name: "Foundations",
        description: "Completed Foundations.",
      },
    },
  },
];

const receiptSchema = JSON.parse(
  await readFile(
    new URL(
      "../schemas/learning/learning-record-receipt.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const ajv = new Ajv2020({ strict: true, formats: { "date-time": true } });
const validateReceiptSchema = ajv.compile(receiptSchema);

test("verified export binds exact scope, events, count, and revision", async () => {
  const exported = await createVerifiedLearningRecordExport(
    "receipt-installation",
    "receipt-learner",
    events,
    "2026-07-28T13:00:00.000Z",
  );
  assert.equal((await verifyLearningRecordExport(exported)).valid, true);
  assert.equal(validateReceiptSchema(exported.receipt), true);
  assert.equal(exported.receipt.eventCount, 1);
  assert.equal(exported.receipt.sourceRevision, 1);

  const tampered = structuredClone(exported);
  tampered.events[0].payload.pathTitle = "Changed after export";
  const validation = await verifyLearningRecordExport(tampered);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("eventDigest does not match the exported events"));
});

test("deletion receipts are pseudonymous and bind immutable source evidence", async () => {
  const receipt = await createLearningRecordDeletionReceipt(
    "receipt-installation",
    "receipt-learner",
    events,
    "delete-receipt-example-0001",
    "2026-07-28T14:00:00.000Z",
  );
  assert.equal(
    (await verifyLearningRecordDeletionReceipt(receipt, events)).valid,
    true,
  );
  assert.equal(validateReceiptSchema(receipt), true);
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes("receipt-installation"), false);
  assert.equal(serialized.includes("receipt-learner"), false);

  const tampered = { ...receipt, eventCount: 2 };
  assert.equal(
    (await verifyLearningRecordDeletionReceipt(tampered)).valid,
    false,
  );
});

test("deletion replay receipts bind restore, prior state, and removed count", async () => {
  const deletion = await createLearningRecordDeletionReceipt(
    "receipt-installation",
    "receipt-learner",
    events,
    "delete-replay-example-0001",
    "2026-07-28T14:00:00.000Z",
  );
  const replay = await createLearningRecordDeletionReplay(
    deletion,
    "restore-rehearsal-20260728",
    events,
    1,
    "2026-07-28T15:00:00.000Z",
  );
  assert.equal(
    (await verifyLearningRecordDeletionReplay(replay)).valid,
    true,
  );
  assert.equal(validateReceiptSchema(replay), true);
  assert.equal(replay.deletedEventCount, 1);

  await assert.rejects(
    () =>
      createLearningRecordDeletionReplay(
        deletion,
        "restore-rehearsal-20260728",
        events,
        0,
        "2026-07-28T15:00:00.000Z",
      ),
    /must equal the restored event count/,
  );
});

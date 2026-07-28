import assert from "node:assert/strict";
import test from "node:test";
import {
  configureLearningRecordAdapter,
  describeLearningRecordAdapter,
  enforceLearningRecordTransactionLimit,
  HOSTED_LEARNING_RECORD_OPERATING_THRESHOLDS,
  LEARNING_RECORD_SEMANTIC_FINGERPRINT,
  readLearningRecordAdapterConfiguration,
  verifyLearningRecordAdapterParity,
} from "../dist/index.js";

test("runtime configuration selects only the supported learning-record adapter", () => {
  const hosted = readLearningRecordAdapterConfiguration(
    { LEARNING_RECORD_ADAPTER: "cloudflare-d1" },
    "cloudflare-worker",
  );
  const selfHosted = readLearningRecordAdapterConfiguration(
    { LEARNING_RECORD_ADAPTER: "postgresql" },
    "node",
  );
  assert.equal(hosted.adapter, "cloudflare-d1");
  assert.equal(hosted.migrationHead, "0010_secure_browser_sessions.sql");
  assert.equal(selfHosted.adapter, "postgresql");
  assert.equal(selfHosted.migrationHead, "007_secure_browser_sessions.sql");
  assert.equal(hosted.semanticFingerprint, selfHosted.semanticFingerprint);
  assert.equal(
    hosted.semanticFingerprint,
    LEARNING_RECORD_SEMANTIC_FINGERPRINT,
  );

  assert.throws(
    () => readLearningRecordAdapterConfiguration({}, "cloudflare-worker"),
    /is required/,
  );
  assert.throws(
    () =>
      readLearningRecordAdapterConfiguration(
        { LEARNING_RECORD_ADAPTER: "postgresql" },
        "cloudflare-worker",
      ),
    /incompatible/,
  );
  assert.throws(
    () =>
      readLearningRecordAdapterConfiguration(
        { LEARNING_RECORD_ADAPTER: "cloudflare-d1" },
        "node",
      ),
    /incompatible/,
  );
  assert.throws(
    () =>
      readLearningRecordAdapterConfiguration(
        { LEARNING_RECORD_ADAPTER: "unknown" },
        "node",
      ),
    /must be cloudflare-d1 or postgresql/,
  );
});

test("adapter construction fails closed on invalid database bindings", () => {
  assert.throws(
    () =>
      configureLearningRecordAdapter(
        {},
        describeLearningRecordAdapter("cloudflare-d1"),
      ),
    /requires prepare and batch/,
  );
  const database = {
    prepare() {
      throw new Error("not used by construction");
    },
    async batch() {
      return [];
    },
  };
  const configured = configureLearningRecordAdapter(
    database,
    describeLearningRecordAdapter("cloudflare-d1"),
  );
  assert.equal(configured.configuration.adapter, "cloudflare-d1");
  assert.ok(configured.store);
});

test("adapter transaction guard enforces the accepted statement boundary", async () => {
  const calls = [];
  const database = {
    prepare(sql) {
      return { sql };
    },
    async batch(statements) {
      calls.push(statements);
      return statements.map(() => ({ success: true, meta: {} }));
    },
  };
  const guarded = enforceLearningRecordTransactionLimit(database);
  await guarded.batch([{}, {}, {}, {}]);
  assert.equal(calls.length, 1);
  await assert.rejects(
    () => guarded.batch([{}, {}, {}, {}, {}]),
    /require 1–4 statements/,
  );
  await assert.rejects(
    () => guarded.batch([]),
    /require 1–4 statements/,
  );
});

test("semantic parity rejects missing adapters and behavioral drift", () => {
  const report = {
    adapterContractVersion: "1.0",
    semanticFingerprint: LEARNING_RECORD_SEMANTIC_FINGERPRINT,
    event: {
      contractVersion: "1.0",
      checks: ["idempotent-retry"],
      eventCountBeforeDeletion: 1,
      deletedEventCount: 1,
    },
    receipt: {
      contractVersion: "1.0",
      checks: ["verified-export"],
      exportedEventCount: 1,
      deletedEventCount: 1,
      replayedEventCount: 1,
    },
  };
  const parity = verifyLearningRecordAdapterParity([
    { adapter: "cloudflare-d1", report },
    { adapter: "postgresql", report: structuredClone(report) },
  ]);
  assert.deepEqual(parity.adapters, ["cloudflare-d1", "postgresql"]);

  const drifted = structuredClone(report);
  drifted.event.deletedEventCount = 0;
  assert.throws(
    () =>
      verifyLearningRecordAdapterParity([
        { adapter: "cloudflare-d1", report },
        { adapter: "postgresql", report: drifted },
      ]),
    /semantic drift detected/,
  );
  assert.throws(
    () =>
      verifyLearningRecordAdapterParity([
        { adapter: "cloudflare-d1", report },
      ]),
    /exactly one Cloudflare D1 and one PostgreSQL/,
  );
});

test("hosted operating thresholds preserve capacity and incident headroom", () => {
  const thresholds = HOSTED_LEARNING_RECORD_OPERATING_THRESHOLDS;
  assert.equal(thresholds.providerDatabaseMaximumBytes, 10 * 1024 ** 3);
  assert.ok(thresholds.databaseWarningBytes < thresholds.databaseChangeFreezeBytes);
  assert.ok(
    thresholds.databaseChangeFreezeBytes <
      thresholds.providerDatabaseMaximumBytes,
  );
  assert.ok(
    thresholds.queryBatchP95TargetMilliseconds <
      thresholds.queryBatchP99AlertMilliseconds,
  );
  assert.ok(
    thresholds.queryBatchP99AlertMilliseconds <
      thresholds.queryBatchCriticalMilliseconds,
  );
  assert.equal(thresholds.sustainedOverloadErrors, 0);
  assert.equal(thresholds.maximumStatementsPerLearningRecordTransaction, 4);
});

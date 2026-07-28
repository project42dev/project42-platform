import {
  LEARNING_EVENT_CONTRACT_VERSION,
} from "./learning-events.js";
import {
  LEARNING_RECORD_RECEIPT_VERSION,
} from "./learning-record-receipts.js";
import {
  SqlLearningEventStore,
  type LearningEventDatabase,
} from "./sql-learning-event-store.js";

export const LEARNING_RECORD_ADAPTER_CONTRACT_VERSION = "1.0" as const;
export const LEARNING_RECORD_ADAPTER_KINDS = [
  "cloudflare-d1",
  "postgresql",
] as const;
export type LearningRecordAdapterKind =
  (typeof LEARNING_RECORD_ADAPTER_KINDS)[number];
export type LearningRecordRuntime = "cloudflare-worker" | "node";

export const LEARNING_RECORD_SEMANTIC_FINGERPRINT =
  "learning-records/1.0;events/1.0;receipts/1.0;append-only;atomic-batch;optimistic-revision;verified-deletion-replay" as const;

export const HOSTED_LEARNING_RECORD_OPERATING_THRESHOLDS = Object.freeze({
  providerDatabaseMaximumBytes: 10 * 1024 ** 3,
  databaseWarningBytes: 7 * 1024 ** 3,
  databaseChangeFreezeBytes: 8 * 1024 ** 3,
  queryBatchP95TargetMilliseconds: 100,
  queryBatchP99AlertMilliseconds: 250,
  queryBatchCriticalMilliseconds: 1_000,
  sustainedOverloadErrors: 0,
  maximumStatementsPerLearningRecordTransaction: 4,
  referenceMeasurementStreams: 50,
  referenceMeasurementP95Milliseconds: 1_000,
});

export interface LearningRecordAdapterConfiguration {
  adapter: LearningRecordAdapterKind;
  runtime: LearningRecordRuntime;
  contractVersion: typeof LEARNING_RECORD_ADAPTER_CONTRACT_VERSION;
  eventContractVersion: typeof LEARNING_EVENT_CONTRACT_VERSION;
  receiptContractVersion: typeof LEARNING_RECORD_RECEIPT_VERSION;
  semanticFingerprint: typeof LEARNING_RECORD_SEMANTIC_FINGERPRINT;
  migrationHead:
    | "0009_learning_record_receipts.sql"
    | "006_learning_record_receipts.sql";
  transactionMode: "atomic-sequential-batch";
}

export interface ConfiguredLearningRecordAdapter {
  configuration: LearningRecordAdapterConfiguration;
  store: SqlLearningEventStore;
}

export function readLearningRecordAdapterConfiguration(
  environment: { LEARNING_RECORD_ADAPTER?: string },
  runtime: LearningRecordRuntime,
): LearningRecordAdapterConfiguration {
  const adapter = environment.LEARNING_RECORD_ADAPTER?.trim();
  if (!adapter) {
    throw new Error("LEARNING_RECORD_ADAPTER is required");
  }
  if (!isLearningRecordAdapterKind(adapter)) {
    throw new Error(
      "LEARNING_RECORD_ADAPTER must be cloudflare-d1 or postgresql",
    );
  }
  const expected =
    runtime === "cloudflare-worker" ? "cloudflare-d1" : "postgresql";
  if (adapter !== expected) {
    throw new Error(
      `LEARNING_RECORD_ADAPTER ${adapter} is incompatible with ${runtime}; expected ${expected}`,
    );
  }
  return describeLearningRecordAdapter(adapter, runtime);
}

export function configureLearningRecordAdapter(
  database: LearningEventDatabase,
  configuration: LearningRecordAdapterConfiguration,
): ConfiguredLearningRecordAdapter {
  if (
    !database ||
    typeof database.prepare !== "function" ||
    typeof database.batch !== "function"
  ) {
    throw new Error(
      "The selected learning-record adapter requires prepare and batch database operations",
    );
  }
  const expectedRuntime =
    configuration.adapter === "cloudflare-d1"
      ? "cloudflare-worker"
      : "node";
  if (configuration.runtime !== expectedRuntime) {
    throw new Error("Learning-record adapter configuration is internally inconsistent");
  }
  return {
    configuration,
    store: new SqlLearningEventStore(
      enforceLearningRecordTransactionLimit(database),
    ),
  };
}

export function enforceLearningRecordTransactionLimit(
  database: LearningEventDatabase,
): LearningEventDatabase {
  return {
    prepare(sql) {
      return database.prepare(sql);
    },
    async batch(statements) {
      const maximum =
        HOSTED_LEARNING_RECORD_OPERATING_THRESHOLDS
          .maximumStatementsPerLearningRecordTransaction;
      if (statements.length === 0 || statements.length > maximum) {
        throw new Error(
          `Learning-record transactions require 1–${maximum} statements`,
        );
      }
      return database.batch(statements);
    },
  };
}

export function describeLearningRecordAdapter(
  adapter: LearningRecordAdapterKind,
  runtime: LearningRecordRuntime =
    adapter === "cloudflare-d1" ? "cloudflare-worker" : "node",
): LearningRecordAdapterConfiguration {
  return {
    adapter,
    runtime,
    contractVersion: LEARNING_RECORD_ADAPTER_CONTRACT_VERSION,
    eventContractVersion: LEARNING_EVENT_CONTRACT_VERSION,
    receiptContractVersion: LEARNING_RECORD_RECEIPT_VERSION,
    semanticFingerprint: LEARNING_RECORD_SEMANTIC_FINGERPRINT,
    migrationHead:
      adapter === "cloudflare-d1"
        ? "0009_learning_record_receipts.sql"
        : "006_learning_record_receipts.sql",
    transactionMode: "atomic-sequential-batch",
  };
}

function isLearningRecordAdapterKind(
  value: string,
): value is LearningRecordAdapterKind {
  return LEARNING_RECORD_ADAPTER_KINDS.includes(
    value as LearningRecordAdapterKind,
  );
}

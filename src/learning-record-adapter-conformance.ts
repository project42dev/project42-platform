import {
  runLearningEventStoreConformance,
  type LearningEventConformanceReport,
  type LearningEventConformanceScope,
} from "./learning-event-conformance.js";
import type { LearningEventStore } from "./learning-event-engine.js";
import {
  runLearningRecordReceiptConformance,
  type LearningRecordReceiptConformanceReport,
} from "./learning-record-receipt-conformance.js";
import type { LearningRecordReceiptStore } from "./learning-record-receipts.js";
import {
  LEARNING_RECORD_ADAPTER_CONTRACT_VERSION,
  LEARNING_RECORD_SEMANTIC_FINGERPRINT,
  type LearningRecordAdapterKind,
} from "./learning-record-adapter.js";

export interface LearningRecordAdapterConformanceReport {
  adapterContractVersion: typeof LEARNING_RECORD_ADAPTER_CONTRACT_VERSION;
  semanticFingerprint: typeof LEARNING_RECORD_SEMANTIC_FINGERPRINT;
  event: LearningEventConformanceReport;
  receipt: LearningRecordReceiptConformanceReport;
}

export interface LearningRecordAdapterParityReport {
  contractVersion: typeof LEARNING_RECORD_ADAPTER_CONTRACT_VERSION;
  semanticFingerprint: typeof LEARNING_RECORD_SEMANTIC_FINGERPRINT;
  adapters: LearningRecordAdapterKind[];
  checks: string[];
}

export async function runLearningRecordAdapterConformance(
  store: LearningEventStore & LearningRecordReceiptStore,
  scope: LearningEventConformanceScope,
): Promise<LearningRecordAdapterConformanceReport> {
  return {
    adapterContractVersion: LEARNING_RECORD_ADAPTER_CONTRACT_VERSION,
    semanticFingerprint: LEARNING_RECORD_SEMANTIC_FINGERPRINT,
    event: await runLearningEventStoreConformance(store, scope),
    receipt: await runLearningRecordReceiptConformance(store, {
      installationId: scope.installationId,
      learnerId: scope.learnerId,
      keyPrefix: `${scope.keyPrefix ?? "project42-conformance"}-receipts`,
    }),
  };
}

export function verifyLearningRecordAdapterParity(
  reports: ReadonlyArray<{
    adapter: LearningRecordAdapterKind;
    report: LearningRecordAdapterConformanceReport;
  }>,
): LearningRecordAdapterParityReport {
  const byAdapter = new Map(reports.map(({ adapter, report }) => [adapter, report]));
  if (
    reports.length !== 2 ||
    byAdapter.size !== 2 ||
    !byAdapter.has("cloudflare-d1") ||
    !byAdapter.has("postgresql")
  ) {
    throw new Error(
      "Learning-record parity requires exactly one Cloudflare D1 and one PostgreSQL report",
    );
  }
  const d1 = normalize(byAdapter.get("cloudflare-d1")!);
  const postgres = normalize(byAdapter.get("postgresql")!);
  if (JSON.stringify(d1) !== JSON.stringify(postgres)) {
    throw new Error(
      `Learning-record adapter semantic drift detected: ${JSON.stringify({
        "cloudflare-d1": d1,
        postgresql: postgres,
      })}`,
    );
  }
  return {
    contractVersion: LEARNING_RECORD_ADAPTER_CONTRACT_VERSION,
    semanticFingerprint: LEARNING_RECORD_SEMANTIC_FINGERPRINT,
    adapters: ["cloudflare-d1", "postgresql"],
    checks: [
      "contract-version",
      "semantic-fingerprint",
      "event-behavior",
      "receipt-behavior",
      "counts",
    ],
  };
}

function normalize(report: LearningRecordAdapterConformanceReport) {
  return {
    adapterContractVersion: report.adapterContractVersion,
    semanticFingerprint: report.semanticFingerprint,
    event: {
      contractVersion: report.event.contractVersion,
      checks: report.event.checks,
      eventCountBeforeDeletion: report.event.eventCountBeforeDeletion,
      deletedEventCount: report.event.deletedEventCount,
    },
    receipt: {
      contractVersion: report.receipt.contractVersion,
      checks: report.receipt.checks,
      exportedEventCount: report.receipt.exportedEventCount,
      deletedEventCount: report.receipt.deletedEventCount,
      replayedEventCount: report.receipt.replayedEventCount,
    },
  };
}

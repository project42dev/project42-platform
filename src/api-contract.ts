import type { LearnerProgress } from "./progress.js";
import type { AccountState, VerifiedIdentity } from "./identity.js";

export type Project42Role = "learner" | "owner";

export interface Account {
  id: string;
  installationId: string;
  identity: Pick<VerifiedIdentity, "issuer" | "subject">;
  displayName: string | null;
  primaryEmail: string | null;
  emailVerified: boolean;
  state: AccountState;
  roles: Project42Role[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgressEnvelope {
  revision: number;
  progress: LearnerProgress;
  synchronizedAt: string;
}

export interface ProgressImportRequest {
  importId: string;
  source: "browser-local-v1" | "project42-portable-json";
  progress: LearnerProgress;
}

export interface AccountStateChangeRequest {
  state: AccountState;
  reason: string;
}

export interface DomainRule {
  id: string;
  domain: string;
  enabled: boolean;
  policyVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDomainRuleRequest {
  domain: string;
  enabled?: boolean;
  reason: string;
}

export type ConsentDecision = "granted" | "withdrawn";

export interface ConsentRecord {
  id: string;
  purpose: string;
  policyVersion: string;
  decision: ConsentDecision;
  decidedAt: string;
}

export type DeletionRequestState =
  | "requested"
  | "cancelled"
  | "processing"
  | "completed";

export interface DeletionRequest {
  id: string;
  state: DeletionRequestState;
  requestedAt: string;
  cancellationDeadline: string;
  completedAt: string | null;
}

export interface LearnerDataExport {
  schemaVersion: 1;
  exportedAt: string;
  account: Account;
  progress: ProgressEnvelope;
  moduleProgress: unknown[];
  assessmentAttempts: unknown[];
  transcriptEntries: unknown[];
  badges: unknown[];
  consents: ConsentRecord[];
  deletionRequests: DeletionRequest[];
  approvalDecisions: unknown[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

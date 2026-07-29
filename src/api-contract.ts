import type { LearnerProgress } from "./progress.js";
import type { AccountState, VerifiedIdentity } from "./identity.js";

export type Project42Role = "learner" | "owner";

export interface Account {
  id: string;
  installationId: string;
  identity: Required<Pick<VerifiedIdentity, "provider">> &
    Pick<VerifiedIdentity, "issuer" | "subject">;
  displayName: string | null;
  primaryEmail: string | null;
  emailVerified: boolean;
  state: AccountState;
  roles: Project42Role[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminPageInfo {
  pageSize: number;
  returnedCount: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface AdminAccountPage {
  accounts: Account[];
  page: AdminPageInfo;
}

export type LinkedIdentityStatus = "active" | "unlinked";

export interface LinkedIdentity {
  id: string;
  provider: string;
  providerLogin: string | null;
  displayName: string | null;
  status: LinkedIdentityStatus;
  primary: boolean;
  linkedAt: string;
  lastVerifiedAt: string;
  lastSeenAt: string;
  unlinkedAt: string | null;
  canUnlink: boolean;
}

export interface IdentityLinkTransaction {
  id: string;
  provider: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  returnPath: string;
  expiresAt: string;
}

export interface CreateIdentityLinkTransactionRequest {
  provider: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  returnPath: string;
}

export interface GithubIdentityLinkStartRequest {
  codeChallenge: string;
  codeChallengeMethod: "S256";
  returnPath: string;
}

export interface GithubIdentityLinkStart {
  link: IdentityLinkTransaction;
  authorizationUrl: string;
}

export interface GithubIdentityLinkCompletionRequest {
  transactionId: string;
  state: string;
  code: string;
  codeVerifier: string;
}

export type AccountMergeProofMethod =
  | "recent-authentication"
  | "owner-assisted-recovery";

export interface AccountMergeProof {
  token: string;
  userId: string;
  method: AccountMergeProofMethod;
  expiresAt: string;
}

export interface OwnerRecoveryProofRequest {
  userId: string;
  methods: Array<
    | "identity-provider-recovery"
    | "support-video-verification"
    | "signed-owner-attestation"
    | "legacy-account-evidence"
  >;
  referenceId: string;
  summary: string;
}

export interface AccountMergePreviewRequest {
  sourceUserId: string;
  survivorUserId: string;
  sourceProofToken: string;
  survivorProofToken: string;
  idempotencyKey: string;
}

export type AccountMergeResolutionChoice = "source" | "survivor";

export interface AccountMergeConflict {
  key: string;
  field:
    | "displayName"
    | "primaryEmail"
    | "bio"
    | "organization"
    | "location"
    | "websiteUrl"
    | "locale"
    | "timeZone"
    | "reducedMotion"
    | "highContrast"
    | "photo"
    | "ownerRole"
    | "assessmentAttempt";
  sourcePresent: boolean;
  survivorPresent: boolean;
  sourceValue?: string | boolean | null;
  survivorValue?: string | boolean | null;
  required: boolean;
  description: string;
}

export type AccountMergePolicyBlockKind =
  | "required-consent"
  | "retention-policy"
  | "legal-hold";

export interface AccountMergePolicyBlock {
  kind: AccountMergePolicyBlockKind;
  account: "source" | "survivor";
  policyKey: string;
  policyVersion: string;
  reasonCode:
    | "required-consent-missing"
    | "required-consent-withdrawn"
    | "required-consent-version-mismatch"
    | "retention-policy-active"
    | "legal-hold-active";
}

export interface AccountMergePreview {
  id: string;
  status: "preview" | "completed" | "rolled-back";
  sourceUserId: string;
  survivorUserId: string;
  sourceDisplayName: string | null;
  survivorDisplayName: string | null;
  sourcePrimaryEmail: string | null;
  survivorPrimaryEmail: string | null;
  proofMethods: {
    source: AccountMergeProofMethod;
    survivor: AccountMergeProofMethod;
  };
  conflicts: AccountMergeConflict[];
  policyBlocks: AccountMergePolicyBlock[];
  recordCounts: Record<string, { source: number; survivor: number }>;
  expiresAt: string;
}

export interface CompleteAccountMergeRequest {
  confirmation: string;
  idempotencyKey: string;
  resolutions: Record<string, AccountMergeResolutionChoice>;
}

export interface AccountMergeReceipt {
  id: string;
  mergeCaseId: string;
  receiptDigest: string;
  snapshotDigest: string;
  mergedAt: string;
  recordCounts: Record<string, number>;
  status: "completed" | "rolled-back";
}

export interface RollbackAccountMergeRequest {
  confirmation: string;
  reason: string;
}

export interface LearnerProfile {
  userId: string;
  displayName: string | null;
  bio: string | null;
  organization: string | null;
  location: string | null;
  websiteUrl: string | null;
  locale: string | null;
  timeZone: string | null;
  reducedMotion: boolean;
  highContrast: boolean;
  photoAvailable: boolean;
  photoUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateLearnerProfileRequest {
  displayName?: string | null;
  bio?: string | null;
  organization?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  locale?: string | null;
  timeZone?: string | null;
  reducedMotion?: boolean;
  highContrast?: boolean;
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

export interface RegistrationStatus {
  state: AccountState;
  requestedAt: string;
  updatedAt: string;
  canSignIn: boolean;
  nextAction: "await-review" | "sign-in" | "contact-owner";
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

export interface DeleteDomainRuleRequest {
  reason: string;
}

export type ConsentDecision = "granted" | "withdrawn";

export interface ConsentRecord {
  id: string;
  purpose: string;
  policyVersion: string;
  decision: ConsentDecision;
  decidedAt: string;
  contractStatus: "current" | "legacy";
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

export interface DeletionStatusReceipt {
  requestId: string;
  statusToken: string;
  issuedAt: string;
}

export interface DeletionStatus {
  requestId: string;
  state: DeletionRequestState;
  requestedAt: string;
  cancellationDeadline: string;
  completedAt: string | null;
}

export interface DeletionStatusRequest {
  requestId: string;
  statusToken: string;
}

export interface AuditEvent {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  requestId: string;
  outcome: "success" | "denied" | "failed";
  reason: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface AdminAuditEventPage {
  events: AuditEvent[];
  page: AdminPageInfo;
}

export interface LearnerModuleProgressRecord {
  pathId: string;
  moduleId: string;
  contentVersion: string;
  status: "visited" | "completed";
  firstSeenAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface LearnerAssessmentAttemptRecord {
  id: string;
  pathId: string;
  moduleId: string;
  contentVersion: string;
  scorePercent: number;
  passed: boolean;
  completedAt: string;
  recordedAt: string;
}

export interface LearnerTranscriptEntryRecord {
  pathId: string;
  pathTitle: string;
  completedModules: number;
  totalModules: number;
  completionPercent: number;
  bestScorePercent: number | null;
  contentVersion: string;
  updatedAt: string;
}

export interface LearnerAchievementRecord {
  badgeId: string;
  name: string;
  description: string;
  earnedAt: string;
  evidenceModuleIds: string[];
  recordedAt: string;
}

export type ApprovalDecisionKind =
  | "registration"
  | "domain-auto-approval"
  | "owner-decision";

export interface LearnerApprovalDecisionRecord {
  id: string;
  fromState: AccountState | null;
  toState: AccountState;
  decisionKind: ApprovalDecisionKind;
  reason: string;
  decidedAt: string;
}

export interface AuthoritativeTranscriptRecords {
  moduleProgress: LearnerModuleProgressRecord[];
  assessmentAttempts: LearnerAssessmentAttemptRecord[];
  transcriptEntries: LearnerTranscriptEntryRecord[];
  achievements: LearnerAchievementRecord[];
}

export interface LearnerDataExport {
  schemaVersion: 1;
  exportedAt: string;
  account: Account;
  profile: LearnerProfile;
  linkedIdentities: LinkedIdentity[];
  progress: ProgressEnvelope;
  moduleProgress: LearnerModuleProgressRecord[];
  assessmentAttempts: LearnerAssessmentAttemptRecord[];
  transcriptEntries: LearnerTranscriptEntryRecord[];
  badges: LearnerAchievementRecord[];
  consents: ConsentRecord[];
  deletionRequests: DeletionRequest[];
  approvalDecisions: LearnerApprovalDecisionRecord[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

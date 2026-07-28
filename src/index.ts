export {
  starterCatalog,
  learningCatalog,
  fieldGuideCatalog,
  getLearningModule,
  getLearningPath,
  getResource,
} from "./catalog.js";
export { scoreKnowledgeCheck } from "./assessment.js";
export {
  buildAssessmentHistory,
  buildCapstoneHistory,
  buildTranscript,
  createEmptyProgress,
  deriveBadges,
  mergeLearnerProgress,
  recordAssessmentAttempt,
  recordCapstoneSubmission,
  recordModuleVisit,
} from "./progress.js";
export {
  validateCatalog,
  validateFieldGuideCatalog,
  validateLearningCatalog,
} from "./schema.js";
export { getResourceFreshness } from "./resource.js";
export {
  buildContentImpactAnalysis,
  CONTENT_MAINTENANCE_SCHEMA_VERSION,
  MAINTENANCE_MODEL_STAGES,
  validateContentChangePacket,
  validateFoundryRoleProfile,
  validateMaintenanceProposal,
} from "./content-maintenance.js";
export {
  buildContributorCreditView,
  buildPublicContributorCreditExport,
  CONTRIBUTION_ROLES,
  CONTRIBUTOR_CONTENT_KINDS,
  CONTRIBUTOR_CREDIT_SCHEMA_VERSION,
  validateContributorCreditPackage,
} from "./contributor-credit.js";
export {
  assessIdentityProvisioningDrift,
  canTransitionIdentityProvisioningState,
  evaluateIdentityProvisioningReadiness,
  IDENTITY_PROVISIONING_ACTORS,
  IDENTITY_PROVISIONING_AUTHORITIES,
  IDENTITY_PROVISIONING_CLIENT_KINDS,
  IDENTITY_PROVISIONING_CONTRACT_VERSION,
  IDENTITY_PROVISIONING_MODES,
  IDENTITY_PROVISIONING_OPERATIONS,
  IDENTITY_PROVISIONING_STATES,
  validateIdentityProviderCompatibility,
  validateIdentityProvisioningPlan,
  validateIdentityProvisioningRecord,
} from "./identity-provisioning.js";
export {
  IdentityProvisioningEngine,
  IdentityProvisioningEngineError,
  InMemoryIdentityProvisioningRecordStore,
} from "./identity-provisioning-engine.js";
export {
  buildPortableLearnerRecord,
  buildTranscriptCsv,
  restorePortableLearnerRecord,
  serializePortableLearnerRecord,
  validatePortableLearnerRecord,
} from "./portable-record.js";
export {
  canonicalizeLearningCommand,
  digestLearningCommand,
  LEARNING_COMMAND_TYPES,
  LEARNING_EVENT_CONTRACT_VERSION,
  LEARNING_EVENT_TYPES,
  validateLearningCommand,
  validateLearningEvent,
} from "./learning-events.js";
export {
  InMemoryLearningEventStore,
  LearningEventEngine,
  LearningEventEngineError,
  LEARNING_EVENT_PERMISSIONS,
  projectLearningEvents,
} from "./learning-event-engine.js";
export { SqlLearningEventStore } from "./sql-learning-event-store.js";
export { runLearningEventStoreConformance } from "./learning-event-conformance.js";
export { runLearningRecordReceiptConformance } from "./learning-record-receipt-conformance.js";
export {
  configureLearningRecordAdapter,
  describeLearningRecordAdapter,
  enforceLearningRecordTransactionLimit,
  HOSTED_LEARNING_RECORD_OPERATING_THRESHOLDS,
  LEARNING_RECORD_ADAPTER_CONTRACT_VERSION,
  LEARNING_RECORD_ADAPTER_KINDS,
  LEARNING_RECORD_SEMANTIC_FINGERPRINT,
  readLearningRecordAdapterConfiguration,
} from "./learning-record-adapter.js";
export {
  runLearningRecordAdapterConformance,
  verifyLearningRecordAdapterParity,
} from "./learning-record-adapter-conformance.js";
export {
  createLearningRecordDeletionReceipt,
  createLearningRecordDeletionReplay,
  createVerifiedLearningRecordExport,
  digestLearningEvents,
  digestLearningRecordScope,
  LEARNING_RECORD_RECEIPT_VERSION,
  verifyLearningRecordDeletionReceipt,
  verifyLearningRecordDeletionReplay,
  verifyLearningRecordExport,
} from "./learning-record-receipts.js";
export {
  LEARNER_ACCOUNT_STATES,
  LEARNER_DATA_PERMISSIONS,
  LEARNER_DATA_ROLES,
  canTransitionLearnerAccount,
  defaultLearnerDataPolicy,
  learnerDataRoleCan,
  validateLearnerDataPolicy,
} from "./learner-data-policy.js";
export {
  ACCOUNT_STATES,
  canTransitionAccount,
  exactDomainMatches,
  getVerifiedEmailDomain,
  normalizeExactDomain,
} from "./identity.js";
export {
  CLASS_SCRIPT_SCHEMA_VERSION,
  CLASS_SEGMENT_KINDS,
  VIRTUAL_INSTRUCTOR_MEDIA_SCHEMA_VERSION,
  validateClassScriptPackage,
  validateVirtualInstructorMediaManifest,
} from "./training-package.js";

export type { AssessmentResult, QuestionFeedback } from "./assessment.js";
export type {
  AssessmentHistoryEntry,
  AssessmentAttempt,
  CapstoneCriterionScore,
  CapstoneHistoryEntry,
  CapstoneSubmission,
  EarnedBadge,
  LearnerProgress,
  RecentModule,
  TranscriptEntry,
} from "./progress.js";
export type {
  ConfiguredLearningRecordAdapter,
  LearningRecordAdapterConfiguration,
  LearningRecordAdapterKind,
  LearningRecordRuntime,
} from "./learning-record-adapter.js";
export type {
  LearningRecordAdapterConformanceReport,
  LearningRecordAdapterParityReport,
} from "./learning-record-adapter-conformance.js";
export type {
  PortableLearnerRecordV1,
  PortableRecordRestoreResult,
  PortableRecordValidation,
} from "./portable-record.js";
export type {
  AssessmentCorrectedEvent,
  AssessmentRecordedEvent,
  CompleteModuleCommand,
  CorrectAssessmentCommand,
  EnrollPathCommand,
  LearningActor,
  LearningActorType,
  LearningBadgeDefinition,
  LearningCommand,
  LearningCommandBase,
  LearningCommandType,
  LearningEvent,
  LearningEventBase,
  LearningEventType,
  ModuleCompletedEvent,
  ModuleVisitedEvent,
  PathEnrolledEvent,
  RecordAssessmentCommand,
  VisitModuleCommand,
} from "./learning-events.js";
export type {
  LearningAssessmentAttemptProjection,
  LearningAssessmentCorrection,
  LearningBadgeProjection,
  LearningCommandResult,
  LearningEnrollmentProjection,
  LearningEventAccess,
  LearningEventAppendResult,
  LearningEventCandidate,
  LearningEventEngineOptions,
  LearningEventPermission,
  LearningEventStore,
  LearningModuleProjection,
  LearningProjection,
  LearningTranscriptProjection,
} from "./learning-event-engine.js";
export type {
  LearningEventDatabase,
  LearningEventPreparedStatement,
} from "./sql-learning-event-store.js";
export type {
  LearningEventConformanceReport,
  LearningEventConformanceScope,
} from "./learning-event-conformance.js";
export type {
  LearningRecordReceiptConformanceReport,
  LearningRecordReceiptConformanceScope,
} from "./learning-record-receipt-conformance.js";
export type {
  LearningRecordDeletionReceipt,
  LearningRecordDeletionReplay,
  LearningRecordExportReceipt,
  LearningRecordReceiptValidation,
  LearningRecordReceiptStore,
  VerifiedLearningRecordExport,
} from "./learning-record-receipts.js";
export type {
  ConsentPurpose,
  LearnerAccountState,
  LearnerDataPermission,
  LearnerDataPolicyV1,
  LearnerDataPolicyValidation,
  LearnerDataRole,
  LearnerDataRoleGrant,
  LifecycleTransition,
  RetentionClass,
} from "./learner-data-policy.js";
export type {
  AccountState,
  IdentityVerifier,
  VerifiedIdentity,
} from "./identity.js";
export type {
  Account,
  AccountMergeConflict,
  AccountMergePreview,
  AccountMergePreviewRequest,
  AccountMergeProof,
  AccountMergeProofMethod,
  AccountMergeReceipt,
  AccountMergeResolutionChoice,
  AccountStateChangeRequest,
  CompleteAccountMergeRequest,
  CreateIdentityLinkTransactionRequest,
  GithubIdentityLinkCompletionRequest,
  GithubIdentityLinkStart,
  GithubIdentityLinkStartRequest,
  IdentityLinkTransaction,
  LinkedIdentity,
  LinkedIdentityStatus,
  ApiErrorBody,
  CreateDomainRuleRequest,
  DeleteDomainRuleRequest,
  DomainRule,
  LearnerProfile,
  ProgressEnvelope,
  ProgressImportRequest,
  Project42Role,
  OwnerRecoveryProofRequest,
  RollbackAccountMergeRequest,
  UpdateLearnerProfileRequest,
} from "./api-contract.js";
export type {
  Catalog,
  CatalogMetadata,
  FieldGuideCatalog,
  CapstoneDefinition,
  CapstoneExemplar,
  CapstoneExemplarArtifact,
  CapstoneExemplarCriterionScore,
  CapstoneRubricCriterion,
  CodeExample,
  InstructorCue,
  InstructorCueKind,
  InstructorScript,
  KnowledgeQuestion,
  LearningActivity,
  LearningModule,
  LearningCatalog,
  LearningPath,
  LessonSection,
  Level,
  Provider,
  ResourceAudience,
  ResourceFormat,
  Resource,
  SourceReference,
  ValidationResult,
} from "./schema.js";
export type {
  ClassScriptApproval,
  ClassScriptContribution,
  ClassScriptPackage,
  ClassScriptSegment,
  ClassScriptVisual,
  ClassSegmentKind,
  VirtualInstructorArtifact,
  VirtualInstructorMediaManifest,
} from "./training-package.js";
export type {
  ResourceFreshness,
  ResourceFreshnessStatus,
} from "./resource.js";
export type {
  ClaimEvidence,
  ContentChangePacket,
  ContentImpactAnalysis,
  DeterministicGateResult,
  FoundryRoleProfile,
  MaintenanceClaim,
  MaintenanceModelStage,
  MaintenanceProposal,
  MaintenanceProposalValidation,
  ModelStageExecution,
  PrimarySourceRegistration,
  PrimarySourceRegistry,
  SourceObservation,
} from "./content-maintenance.js";
export type {
  AcceptedChangeEvidence,
  AiAssistanceDisclosure,
  AttributionConsent,
  AttributionConsentStatus,
  ContributionCredit,
  ContributionRole,
  ContributorAccountState,
  ContributorContentReference,
  ContributorCreditPackage,
  ContributorCreditSurface,
  ContributorCreditView,
  ContributorCreditViewEntry,
  ContributorIdentityEvidence,
  ContributorRepositoryEvidence,
  PublicContributorCredit,
  PublicContributorCreditExport,
  PublicContributorProfile,
} from "./contributor-credit.js";
export type {
  IdentityProviderCompatibility,
  IdentityProvisioningActor,
  IdentityProvisioningAdapter,
  IdentityProvisioningAdapterContext,
  IdentityProvisioningAdapterResult,
  IdentityProvisioningAuditEvent,
  IdentityProvisioningAuthority,
  IdentityProvisioningAuthorityBoundary,
  IdentityProvisioningAuthorityGate,
  IdentityProvisioningClient,
  IdentityProvisioningClientKind,
  IdentityProvisioningContinuation,
  IdentityProvisioningDrift,
  IdentityProvisioningDriftSeverity,
  IdentityProvisioningError,
  IdentityProvisioningGateStatus,
  IdentityProvisioningMode,
  IdentityProvisioningObservation,
  IdentityProvisioningOperation,
  IdentityProvisioningPlan,
  IdentityProvisioningProvider,
  IdentityProvisioningReadiness,
  IdentityProvisioningRecord,
  IdentityProvisioningRollback,
  IdentityProvisioningSecretPolicy,
  IdentityProvisioningSecretKind,
  IdentityProvisioningSecretMaterial,
  IdentityProvisioningSecretReference,
  IdentityProvisioningSecretSink,
  IdentityProvisioningSecretStoreRequest,
  IdentityProvisioningSecretStatus,
  IdentityProvisioningState,
} from "./identity-provisioning.js";
export type {
  IdentityProvisioningAuthorityDecisionRequest,
  IdentityProvisioningEngineOptions,
  IdentityProvisioningRecordStore,
  IdentityProvisioningRunRequest,
} from "./identity-provisioning-engine.js";
export {
  KeycloakIdentityProvisioningAdapter,
  KeycloakIdentityProvisioningAdapterError,
  keycloakIdentityProviderCompatibility,
} from "./keycloak-identity-provisioning-adapter.js";
export type {
  KeycloakIdentityProvisioningAdapterOptions,
} from "./keycloak-identity-provisioning-adapter.js";
export { RESOURCE_AUDIENCES, RESOURCE_FORMATS } from "./schema.js";

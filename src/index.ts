export {
  starterCatalog,
  learningCatalog,
  fieldGuideCatalog,
  getLearningModule,
  getLearningPath,
  getResource,
} from "./catalog.js";
export {
  BADGE_CLASSES,
  BADGE_CREDENTIAL_STATUSES,
  BADGE_DEFINITION_CONTRACT_VERSION,
  BADGE_EVIDENCE_KINDS,
  BADGE_EVIDENCE_RESULTS,
  BADGE_LIFECYCLE_ACTOR_TYPES,
  BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION,
  BADGE_LIFECYCLE_EVENT_TYPES,
  BadgeCredentialError,
  OPEN_BADGES_3_MAPPING_BOUNDARY,
  projectBadgeLifecycle,
  SUPPORTED_BADGE_DEFINITION_CONTRACT_VERSIONS,
  SUPPORTED_BADGE_LIFECYCLE_EVENT_CONTRACT_VERSIONS,
  validateBadgeDefinition,
  validateBadgeIssuanceEvidence,
  validateBadgeLifecycleEvent,
} from "./badge-credentials.js";
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
  authorizeProject42Operation,
  PROJECT42_AUTHORIZATION_DENIAL_CODES,
  PROJECT42_AUTHORIZATION_PERMISSIONS,
  PROJECT42_AUTHORIZATION_ROLES,
} from "./authorization.js";
export {
  buildPortableLearnerRecord,
  buildTranscriptCsv,
  restorePortableLearnerRecord,
  serializePortableLearnerRecord,
  validatePortableLearnerRecord,
} from "./portable-record.js";
export {
  AUTHORITATIVE_TRANSCRIPT_CSV_COLUMNS,
  AUTHORITATIVE_TRANSCRIPT_CSV_SCHEMA_VERSION,
  buildAuthoritativeTranscriptCsv,
  escapeCsvCell,
} from "./authoritative-transcript-csv.js";
export {
  canonicalizeLearningCommand,
  digestLearningCommand,
  LEARNING_COMMAND_TYPES,
  LEARNING_EVENT_CONTRACT_VERSION,
  LEARNING_EVENT_TYPES,
  SUPPORTED_LEARNING_EVENT_CONTRACT_VERSIONS,
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
  BROWSER_SESSION_COOKIE,
  clearHostCookie,
  createHostCookie,
  createPkceChallenge,
  normalizeReturnTarget,
  OIDC_TRANSACTION_COOKIE,
  openOidcTransaction,
  randomBase64Url,
  readBrowserOidcConfiguration,
  readCookie,
  sealOidcTransaction,
  sha256Base64Url,
} from "./browser-session.js";
export {
  AUTH_ABUSE_ROUTES,
  AuthAbuseLimiterUnavailableError,
  CloudflareAuthAbuseLimiter,
  normalizeAuthClientAddress,
  readCloudflareClientAddress,
} from "./auth-abuse-limiter.js";
export type {
  AuthAbuseLimitDecision,
  AuthAbuseLimiter,
  AuthAbuseLimitRequest,
  AuthAbuseRoute,
  CloudflareAuthAbuseBindings,
  CloudflareRateLimitBinding,
} from "./auth-abuse-limiter.js";
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
  createLearningRecordRecoveryBackup,
  digestLearningRecordRecoveryArtifact,
  isLearningRecordRecoveryBackupExpired,
  LEARNING_RECORD_RECOVERY_BACKUP_VERSION,
  verifyLearningRecordRecoveryBackup,
} from "./learning-record-recovery-backup.js";
export {
  DEFAULT_LEARNING_RECORD_RECOVERY_OBJECTIVES,
  LEARNING_RECORD_RECOVERY_CONTRACT_VERSION,
  measureLearningRecordRecovery,
  restoreVerifiedLearningRecordExport,
  runLearningRecordRecoveryConformance,
  runMeasuredLearningRecordRecoveryConformance,
} from "./learning-record-recovery.js";
export {
  LEARNER_ACCOUNT_STATES,
  LEARNER_CONSENT_PURPOSES,
  LEARNER_DATA_PERMISSIONS,
  LEARNER_DATA_POLICY_VERSION,
  LEARNER_DATA_ROLES,
  TERMS_OF_SERVICE_VERSION,
  canTransitionLearnerAccount,
  defaultLearnerDataPolicy,
  learnerDataRoleCan,
  validateLearnerDataPolicy,
} from "./learner-data-policy.js";
export {
  DEFAULT_ACCOUNT_MERGE_CONSENT_REQUIREMENTS,
  readAccountMergeConsentRequirements,
} from "./account-merge-policy.js";
export {
  ACCOUNT_STATES,
  canTransitionAccount,
  exactDomainMatches,
  getVerifiedEmailDomain,
  normalizeExactDomain,
} from "./identity.js";
export {
  ACCOUNT_NOTIFICATION_CONTRACT_VERSION,
  ACCOUNT_NOTIFICATION_DELIVERY_DEADLINE_MS,
  ACCOUNT_NOTIFICATION_DELIVERY_MIN_DEADLINE_MS,
  ACCOUNT_NOTIFICATION_DISPATCH_MAX_ITEMS,
  ACCOUNT_NOTIFICATION_KINDS,
  ACCOUNT_NOTIFICATION_STATES,
  ACCOUNT_NOTIFICATION_TEMPLATE_VERSION,
  AccountNotificationDeliveryError,
  DeterministicAccountNotificationAdapter,
  DisabledAccountNotificationAdapter,
  ServiceBindingAccountNotificationAdapter,
  accountNotificationRetryDelaySeconds,
  normalizeAccountNotificationDeliveryError,
  normalizeAccountNotificationDeliveryDeadlineMs,
  renderAccountNotification,
} from "./account-notifications.js";
export type {
  AccountNotificationAdapter,
  AccountNotificationAuditActor,
  AccountNotificationDeliveryContext,
  AccountNotificationDeliveryService,
  AccountNotificationDeliveryResult,
  AccountNotificationKind,
  AccountNotificationMessage,
  AccountNotificationState,
  RenderedAccountNotification,
} from "./account-notifications.js";
export {
  CLASS_SCRIPT_SCHEMA_VERSION,
  CLASS_SEGMENT_KINDS,
  VIRTUAL_INSTRUCTOR_MEDIA_SCHEMA_VERSION,
  validateClassScriptPackage,
  validateVirtualInstructorMediaManifest,
} from "./training-package.js";
export {
  classScriptPackages,
  getClassScriptPackage,
  trainingPackageCoverage,
} from "./training-catalog.js";

export type { AssessmentResult, QuestionFeedback } from "./assessment.js";
export type {
  BadgeClass,
  BadgeCorrectedEventV1,
  BadgeCredentialErrorCode,
  BadgeCredentialProjectionV1,
  BadgeCredentialStatus,
  BadgeCriteriaV1,
  BadgeDefinitionV1,
  BadgeDisplayTextV1,
  BadgeEvidenceKind,
  BadgeEvidenceRequirementV1,
  BadgeEvidenceResult,
  BadgeEvidenceV1,
  BadgeExpirationPolicyV1,
  BadgeExpiredEventV1,
  BadgeIssuedEventV1,
  BadgeIssuerPolicyV1,
  BadgeLifecycleActorType,
  BadgeLifecycleActorV1,
  BadgeLifecycleEventBaseV1,
  BadgeLifecycleEventType,
  BadgeLifecycleEventV1,
  BadgeRevokedEventV1,
  OpenBadges3MappingBoundaryV1,
} from "./badge-credentials.js";
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
  ImportProgressCommand,
  LearningActor,
  LearningActorType,
  LearningBadgeDefinition,
  LearningCommand,
  LearningCommandBase,
  LearningCommandType,
  LearningEvent,
  LearningEventBase,
  LearningEventContractVersion,
  LearningEventType,
  LearningProgressImportSource,
  ModuleCompletedEvent,
  ModuleVisitedEvent,
  PathEnrolledEvent,
  ProgressImportedEvent,
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
  BrowserOidcConfiguration,
  BrowserOidcTransaction,
  BrowserSessionEnvironment,
} from "./browser-session.js";
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
  LearningRecordRecoveryMeasurement,
  LearningRecordRecoveryReport,
  LearningRecordRecoveryScope,
  MeasuredLearningRecordRecoveryOptions,
} from "./learning-record-recovery.js";
export type {
  ConsentPurpose,
  LearnerConsentPurpose,
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
  AccountMergeConsentRequirement,
} from "./account-merge-policy.js";
export type {
  AccountState,
  IdentityVerifier,
  VerifiedIdentity,
} from "./identity.js";
export type {
  Account,
  AdminAccountPage,
  AdminAuditEventPage,
  AccountNotificationDispatchRequest,
  AccountNotificationDispatchSummary,
  AccountNotificationReplayRequest,
  AccountNotificationReplaySummary,
  AdminPageInfo,
  AccountMergeConflict,
  AccountMergePolicyBlock,
  AccountMergePolicyBlockKind,
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
  AuditEvent,
  ApiErrorBody,
  CreateDomainRuleRequest,
  DeletionStatus,
  DeletionStatusReceipt,
  DeletionStatusRequest,
  DeleteDomainRuleRequest,
  DomainRule,
  LearnerProfile,
  LearnerAchievementRecord,
  LearnerApprovalDecisionRecord,
  LearnerAssessmentAttemptRecord,
  LearnerDataExport,
  LearnerModuleProgressRecord,
  LearnerTranscriptEntryRecord,
  AuthoritativeTranscriptRecords,
  ApprovalDecisionKind,
  ProgressEnvelope,
  ProgressImportRequest,
  Project42Role,
  RegistrationStatus,
  OwnerRecoveryProofRequest,
  RollbackAccountMergeRequest,
  UpdateLearnerProfileRequest,
} from "./api-contract.js";
export {
  ADMIN_PAGE_DEFAULT_SIZE,
  ADMIN_PAGE_MAX_SIZE,
} from "./admin-pagination.js";
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
  ClassScriptLearningHandoff,
  ClassScriptPackage,
  ClassScriptSegment,
  ClassScriptVisual,
  ClassSegmentKind,
  TrainingPackageCoverage,
  TrainingPackageCoverageEntry,
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

export {
  loadDynamicCatalog,
  loadCatalogFromPath,
  mergeCatalogs,
  type ContentSyncOptions,
  type ContentSyncSummary,
} from "./content-sync.js";

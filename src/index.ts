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
  buildPortableLearnerRecord,
  buildTranscriptCsv,
  restorePortableLearnerRecord,
  serializePortableLearnerRecord,
  validatePortableLearnerRecord,
} from "./portable-record.js";
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
export {
  classScriptPackages,
  getClassScriptPackage,
  trainingPackageCoverage,
} from "./training-catalog.js";

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
  PortableLearnerRecordV1,
  PortableRecordRestoreResult,
  PortableRecordValidation,
} from "./portable-record.js";
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
  AccountStateChangeRequest,
  ApiErrorBody,
  CreateDomainRuleRequest,
  DomainRule,
  ProgressEnvelope,
  ProgressImportRequest,
  Project42Role,
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
export { RESOURCE_AUDIENCES, RESOURCE_FORMATS } from "./schema.js";

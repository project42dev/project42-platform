export {
  starterCatalog,
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
export { validateCatalog } from "./schema.js";
export {
  buildPortableLearnerRecord,
  buildTranscriptCsv,
  restorePortableLearnerRecord,
  serializePortableLearnerRecord,
  validatePortableLearnerRecord,
} from "./portable-record.js";

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
  Catalog,
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
  LearningPath,
  LessonSection,
  Level,
  Provider,
  Resource,
  SourceReference,
  ValidationResult,
} from "./schema.js";

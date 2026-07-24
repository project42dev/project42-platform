export {
  starterCatalog,
  getLearningModule,
  getLearningPath,
  getResource,
} from "./catalog.js";
export { scoreKnowledgeCheck } from "./assessment.js";
export {
  buildTranscript,
  createEmptyProgress,
  deriveBadges,
  recordAssessmentAttempt,
} from "./progress.js";
export { validateCatalog } from "./schema.js";

export type { AssessmentResult, QuestionFeedback } from "./assessment.js";
export type {
  AssessmentAttempt,
  EarnedBadge,
  LearnerProgress,
  TranscriptEntry,
} from "./progress.js";
export type {
  Catalog,
  CodeExample,
  KnowledgeQuestion,
  LearningModule,
  LearningPath,
  LessonSection,
  Level,
  Provider,
  Resource,
  SourceReference,
  ValidationResult,
} from "./schema.js";

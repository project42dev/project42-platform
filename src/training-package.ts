import type { LearningModule, ValidationResult } from "./schema.js";

export const CLASS_SCRIPT_SCHEMA_VERSION = "2.0" as const;
export const VIRTUAL_INSTRUCTOR_MEDIA_SCHEMA_VERSION = "1.0" as const;

export const CLASS_SEGMENT_KINDS = [
  "welcome",
  "narration",
  "demonstration",
  "learner-prompt",
  "pause",
  "checkpoint",
  "feedback",
  "transition",
  "assessment-handoff",
  "closing",
] as const;

export type ClassSegmentKind = (typeof CLASS_SEGMENT_KINDS)[number];

export interface ClassScriptVisual {
  description: string;
  altText: string;
  reducedMotionDescription: string;
}

export interface ClassScriptSegment {
  id: string;
  kind: ClassSegmentKind;
  sectionId?: string;
  delivery: "spoken" | "silent";
  spokenText?: string;
  stageDirection: string;
  estimatedSeconds: number;
  sourceUrls: string[];
  visual?: ClassScriptVisual;
  expectedLearnerAction?: string;
  feedback?: {
    correct: string;
    retry: string;
  };
}

export interface ClassScriptContribution {
  role:
    | "evidence-research"
    | "curriculum-writing"
    | "factual-verification"
    | "learning-design-review"
    | "accessibility-review";
  roleProfileRef: string;
  providerFamily: string;
  completedAt: string;
}

export interface ClassScriptApproval {
  role: "editorial" | "subject-matter" | "accessibility";
  status: "approved";
  reviewedAt: string;
  evidenceRef: string;
}

export interface ClassScriptPackage {
  schemaVersion: typeof CLASS_SCRIPT_SCHEMA_VERSION;
  id: string;
  version: string;
  moduleId: string;
  locale: string;
  title: string;
  audience: string;
  learningObjectives: string[];
  plannedDurationSeconds: number;
  spokenWordCount: number;
  segments: ClassScriptSegment[];
  accessibility: {
    transcriptRequired: true;
    captionsRequired: true;
    textOnlyEquivalentRequired: true;
    reducedMotionRequired: true;
  };
  provenance: {
    canonicalContentVersion: string;
    evidenceReviewedAt: string;
    contributions: ClassScriptContribution[];
    approvals: ClassScriptApproval[];
  };
  releaseStatus: "draft" | "approved";
}

export interface VirtualInstructorArtifact {
  kind:
    | "audio"
    | "video"
    | "captions"
    | "transcript"
    | "poster"
    | "text-only"
    | "reduced-motion";
  path: string;
  mediaType: string;
  sha256: string;
  locale: string;
}

export interface VirtualInstructorMediaManifest {
  schemaVersion: typeof VIRTUAL_INSTRUCTOR_MEDIA_SCHEMA_VERSION;
  id: string;
  version: string;
  classScript: {
    id: string;
    version: string;
    sha256: string;
  };
  production: {
    mode: "pre-rendered";
    generatedAt: string;
    adapter: string;
    modelProfileRef: string;
    voiceProfileRef: string;
    avatarProfileRef?: string;
    pronunciationReviewEvidenceRef: string;
    disclosure: string;
  };
  artifacts: VirtualInstructorArtifact[];
  approvals: Array<{
    role: "editorial" | "factual" | "accessibility" | "media-release";
    status: "approved";
    reviewedAt: string;
    evidenceRef: string;
  }>;
  releaseStatus: "draft" | "approved";
}

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const privateReferencePattern =
  /(?:[a-z]:\\|\\\\|\/users\/|\/home\/|tenant[-_ ]?id|subscription[-_ ]?id|client[-_ ]?secret|api[-_ ]?key)/i;

export function validateClassScriptPackage(
  script: ClassScriptPackage,
  module?: LearningModule,
): ValidationResult {
  const errors: string[] = [];

  if (script.schemaVersion !== CLASS_SCRIPT_SCHEMA_VERSION) {
    errors.push("Class script has an unsupported schema version");
  }
  if (!idPattern.test(script.id) || !idPattern.test(script.moduleId)) {
    errors.push("Class script and module IDs must use lowercase kebab case");
  }
  if (!semverPattern.test(script.version)) {
    errors.push("Class script version must be semantic version x.y.z");
  }
  if (!script.locale.trim() || !script.title.trim() || !script.audience.trim()) {
    errors.push("Class script locale, title, and audience are required");
  }
  if (
    !Number.isInteger(script.plannedDurationSeconds) ||
    script.plannedDurationSeconds < 300
  ) {
    errors.push("Class script planned duration must be at least five minutes");
  }

  const segmentIds = new Set<string>();
  const kinds = new Set<ClassSegmentKind>();
  const moduleSectionIds = new Set(module?.sections.map((section) => section.id) ?? []);
  const moduleSourceUrls = new Set(module?.sources.map((source) => source.url) ?? []);
  let calculatedWords = 0;
  let calculatedSeconds = 0;

  for (const segment of script.segments) {
    if (!idPattern.test(segment.id) || segmentIds.has(segment.id)) {
      errors.push(`Class script has an invalid or duplicate segment ID: ${segment.id}`);
    }
    segmentIds.add(segment.id);
    kinds.add(segment.kind);
    calculatedSeconds += segment.estimatedSeconds;

    if (
      !Number.isInteger(segment.estimatedSeconds) ||
      segment.estimatedSeconds <= 0
    ) {
      errors.push(`Segment ${segment.id} has an invalid duration`);
    }
    if (!segment.stageDirection.trim()) {
      errors.push(`Segment ${segment.id} needs a stage direction`);
    }
    if (segment.delivery === "spoken") {
      if (!segment.spokenText?.trim()) {
        errors.push(`Spoken segment ${segment.id} needs read-aloud text`);
      } else {
        calculatedWords += countWords(segment.spokenText);
      }
    } else if (segment.spokenText?.trim()) {
      errors.push(`Silent segment ${segment.id} cannot contain spoken text`);
    }
    if (
      segment.sectionId &&
      module &&
      !moduleSectionIds.has(segment.sectionId)
    ) {
      errors.push(
        `Segment ${segment.id} references missing module section ${segment.sectionId}`,
      );
    }
    if (
      segment.sourceUrls.some((url) => privateReferencePattern.test(url))
    ) {
      errors.push(`Segment ${segment.id} contains a private source reference`);
    }
    if (
      module &&
      segment.sourceUrls.some((url) => !moduleSourceUrls.has(url))
    ) {
      errors.push(`Segment ${segment.id} references an undeclared module source`);
    }
    if (segment.kind === "narration" && segment.sourceUrls.length === 0) {
      errors.push(`Narration segment ${segment.id} needs at least one source`);
    }
    if (segment.visual) {
      if (
        !segment.visual.description.trim() ||
        !segment.visual.altText.trim() ||
        !segment.visual.reducedMotionDescription.trim()
      ) {
        errors.push(`Segment ${segment.id} has an incomplete accessible visual`);
      }
    }
    if (
      ["learner-prompt", "checkpoint"].includes(segment.kind) &&
      !segment.expectedLearnerAction?.trim()
    ) {
      errors.push(`Interactive segment ${segment.id} needs an expected learner action`);
    }
    if (
      segment.kind === "feedback" &&
      (!segment.feedback?.correct.trim() || !segment.feedback.retry.trim())
    ) {
      errors.push(`Feedback segment ${segment.id} needs correct and retry feedback`);
    }
  }

  for (const required of [
    "welcome",
    "narration",
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
    "closing",
  ] satisfies ClassSegmentKind[]) {
    if (!kinds.has(required)) {
      errors.push(`Class script needs a ${required} segment`);
    }
  }

  if (calculatedWords !== script.spokenWordCount) {
    errors.push(
      `Class script spokenWordCount is ${script.spokenWordCount}; calculated ${calculatedWords}`,
    );
  }
  if (calculatedSeconds !== script.plannedDurationSeconds) {
    errors.push(
      `Class script segment duration is ${calculatedSeconds}; planned ${script.plannedDurationSeconds}`,
    );
  }
  const speechMinutes = script.segments
    .filter((segment) => segment.delivery === "spoken")
    .reduce((total, segment) => total + segment.estimatedSeconds, 0) / 60;
  const wordsPerMinute = speechMinutes > 0 ? calculatedWords / speechMinutes : 0;
  if (wordsPerMinute < 90 || wordsPerMinute > 180) {
    errors.push(
      `Class script spoken pace must be between 90 and 180 words per minute; calculated ${Math.round(wordsPerMinute)}`,
    );
  }

  if (module) {
    if (script.moduleId !== module.id) {
      errors.push(`Class script module ${script.moduleId} does not match ${module.id}`);
    }
    if (
      JSON.stringify(script.learningObjectives) !==
      JSON.stringify(module.objectives)
    ) {
      errors.push("Class script learning objectives do not match the module");
    }
    for (const section of module.sections) {
      if (
        !script.segments.some(
          (segment) =>
            segment.sectionId === section.id &&
            segment.kind === "narration" &&
            segment.delivery === "spoken",
        )
      ) {
        errors.push(`Module section ${section.id} needs read-aloud narration`);
      }
    }
  }

  validateContributionIndependence(script, errors);
  validateScriptApprovalGate(script, errors);
  validateNoPrivateReferences(script, "Class script", errors);

  return { valid: errors.length === 0, errors };
}

export function validateVirtualInstructorMediaManifest(
  manifest: VirtualInstructorMediaManifest,
): ValidationResult {
  const errors: string[] = [];
  if (manifest.schemaVersion !== VIRTUAL_INSTRUCTOR_MEDIA_SCHEMA_VERSION) {
    errors.push("Virtual-instructor media has an unsupported schema version");
  }
  if (!idPattern.test(manifest.id) || !semverPattern.test(manifest.version)) {
    errors.push("Virtual-instructor media ID or version is invalid");
  }
  if (
    !sha256Pattern.test(manifest.classScript.sha256) ||
    !semverPattern.test(manifest.classScript.version)
  ) {
    errors.push("Virtual-instructor media has an invalid class-script reference");
  }
  if (manifest.production.mode !== "pre-rendered") {
    errors.push("Virtual-instructor media must be produced before learner runtime");
  }
  if (
    !manifest.production.adapter.trim() ||
    !manifest.production.modelProfileRef.trim() ||
    !manifest.production.voiceProfileRef.trim() ||
    !manifest.production.pronunciationReviewEvidenceRef.trim() ||
    !manifest.production.disclosure.trim()
  ) {
    errors.push("Virtual-instructor production provenance is incomplete");
  }

  const artifactKinds = new Set<string>();
  const artifactPaths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    artifactKinds.add(artifact.kind);
    if (
      !isSafeRelativePath(artifact.path) ||
      artifactPaths.has(artifact.path)
    ) {
      errors.push(`Artifact path is unsafe or duplicated: ${artifact.path}`);
    }
    artifactPaths.add(artifact.path);
    if (!sha256Pattern.test(artifact.sha256)) {
      errors.push(`Artifact ${artifact.path} has an invalid SHA-256 digest`);
    }
    if (!artifact.mediaType.trim() || !artifact.locale.trim()) {
      errors.push(`Artifact ${artifact.path} has incomplete media metadata`);
    }
  }
  for (const required of [
    "audio",
    "captions",
    "transcript",
    "text-only",
    "reduced-motion",
  ]) {
    if (!artifactKinds.has(required)) {
      errors.push(`Virtual-instructor media needs a ${required} artifact`);
    }
  }
  if (artifactKinds.has("video") && !artifactKinds.has("poster")) {
    errors.push("Virtual-instructor video needs a poster artifact");
  }

  if (manifest.releaseStatus === "approved") {
    for (const requiredRole of [
      "editorial",
      "factual",
      "accessibility",
      "media-release",
    ] as const) {
      if (
        !manifest.approvals.some(
          (approval) =>
            approval.role === requiredRole && approval.status === "approved",
        )
      ) {
        errors.push(`Approved media needs ${requiredRole} approval`);
      }
    }
  }
  validateNoPrivateReferences(manifest, "Virtual-instructor media", errors);
  return { valid: errors.length === 0, errors };
}

function validateContributionIndependence(
  script: ClassScriptPackage,
  errors: string[],
) {
  const roles = new Map(
    script.provenance.contributions.map((contribution) => [
      contribution.role,
      contribution,
    ]),
  );
  for (const requiredRole of [
    "evidence-research",
    "curriculum-writing",
    "factual-verification",
    "learning-design-review",
    "accessibility-review",
  ] as const) {
    if (!roles.has(requiredRole)) {
      errors.push(`Class script provenance needs ${requiredRole}`);
    }
  }
  const writer = roles.get("curriculum-writing");
  const verifier = roles.get("factual-verification");
  if (
    writer &&
    verifier &&
    writer.providerFamily.toLowerCase() === verifier.providerFamily.toLowerCase()
  ) {
    errors.push(
      "Curriculum writing and factual verification must use different provider families",
    );
  }
}

function validateScriptApprovalGate(
  script: ClassScriptPackage,
  errors: string[],
) {
  if (script.releaseStatus !== "approved") return;
  for (const requiredRole of [
    "editorial",
    "subject-matter",
    "accessibility",
  ] as const) {
    if (
      !script.provenance.approvals.some(
        (approval) =>
          approval.role === requiredRole && approval.status === "approved",
      )
    ) {
      errors.push(`Approved class script needs ${requiredRole} approval`);
    }
  }
}

function validateNoPrivateReferences(
  value: unknown,
  label: string,
  errors: string[],
) {
  if (privateReferencePattern.test(JSON.stringify(value))) {
    errors.push(`${label} contains a private path, identifier, or secret-like field`);
  }
}

function isSafeRelativePath(path: string) {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.startsWith("\\") &&
    !path.includes("..") &&
    !path.includes("\\") &&
    !privateReferencePattern.test(path)
  );
}

function countWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

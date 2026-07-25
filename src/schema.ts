export type Provider = "provider-neutral" | "anthropic" | "openai" | "google";
export type Level = "beginner" | "intermediate" | "advanced";

export interface SourceReference {
  title: string;
  url: string;
  publisher: string;
  lastVerified: string;
}

export interface CodeExample {
  language: string;
  label: string;
  code: string;
}

export interface LessonSection {
  id: string;
  title: string;
  paragraphs: string[];
  callout?: string;
  code?: CodeExample;
}

export interface LearningActivity {
  id: string;
  title: string;
  instructions: string[];
  evidence: string[];
  reflectionPrompt: string;
}

export type ComparisonStatus =
  | "documented"
  | "changing"
  | "non-equivalent"
  | "unknown";

export interface ProviderComparisonCell {
  status: ComparisonStatus;
  summary: string;
  sourceUrls: string[];
}

export interface ProviderComparisonDimension {
  id: string;
  title: string;
  portableCore: string;
  providers: {
    anthropic: ProviderComparisonCell;
    openai: ProviderComparisonCell;
    google: ProviderComparisonCell;
  };
}

export interface ProviderComparisonMatrix {
  asOf: string;
  caveat: string;
  dimensions: ProviderComparisonDimension[];
}

export type InstructorCueKind =
  | "narration"
  | "visual"
  | "learner-prompt"
  | "pause"
  | "checkpoint"
  | "assessment-handoff";

export interface InstructorCue {
  id: string;
  kind: InstructorCueKind;
  text: string;
  sectionId?: string;
  accessibilityAlternative?: string;
}

export interface InstructorCaption {
  cueId: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface InstructorScript {
  schemaVersion: "1.0" | "1.1";
  estimatedSeconds: number;
  cues: InstructorCue[];
  transcript?: string;
  captions?: InstructorCaption[];
  reducedMotionAlternative?: string;
}

export interface CapstoneRubricCriterion {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
  evidenceRequired: string[];
}

export interface CapstoneExemplarArtifact {
  ref: string;
  label: string;
  content: string;
}

export interface CapstoneExemplarCriterionScore {
  criterionId: string;
  pointsAwarded: number;
  evidenceRefs: string[];
  reviewerNote: string;
}

export interface CapstoneExemplar {
  id: string;
  kind: "complete" | "flawed";
  title: string;
  summary: string;
  artifacts: CapstoneExemplarArtifact[];
  criterionScores: CapstoneExemplarCriterionScore[];
  expectedScorePercent: number;
  expectedPassed: boolean;
}

export interface CapstoneDefinition {
  id: string;
  title: string;
  summary: string;
  requiredArtifacts: string[];
  requiresCriterionEvidence?: boolean;
  requiresCalibrationExemplars?: boolean;
  exemplars?: CapstoneExemplar[];
  rubric: {
    passPercent: number;
    criteria: CapstoneRubricCriterion[];
  };
}

export interface KnowledgeQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

export interface LearningModule {
  id: string;
  title: string;
  summary: string;
  level: Level;
  providers: Provider[];
  estimatedMinutes: number;
  objectives: string[];
  prerequisites: string[];
  sections: LessonSection[];
  activity?: LearningActivity;
  comparisonMatrix?: ProviderComparisonMatrix;
  instructorScript?: InstructorScript;
  capstone?: CapstoneDefinition;
  knowledgeCheck: {
    passPercent: number;
    questions: KnowledgeQuestion[];
  };
  sources: SourceReference[];
}

export interface LearningPath {
  id: string;
  title: string;
  summary: string;
  audience: string;
  level: Level;
  moduleIds: string[];
  badge: {
    id: string;
    name: string;
    description: string;
  };
}

export interface Resource {
  id: string;
  title: string;
  summary: string;
  category: string;
  level: Level;
  providers: Provider[];
  lastVerified: string;
  tags: string[];
  sections: LessonSection[];
  sources: SourceReference[];
}

export interface Catalog {
  schemaVersion: "1.0";
  contentVersion: string;
  title: string;
  description: string;
  providers: Array<{
    id: Provider;
    name: string;
    description: string;
  }>;
  paths: LearningPath[];
  modules: LearningModule[];
  resources: Resource[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCatalog(catalog: Catalog): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  const moduleIds = new Set(catalog.modules.map((module) => module.id));
  const providerIds = new Set(catalog.providers.map((provider) => provider.id));

  const register = (id: string, location: string) => {
    if (!id.trim()) errors.push(`${location} has an empty id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      errors.push(`${location} has an invalid id: ${id}`);
    }
    if (ids.has(id)) errors.push(`Duplicate content id: ${id}`);
    ids.add(id);
  };

  if (catalog.schemaVersion !== "1.0") {
    errors.push(`Unsupported schema version: ${catalog.schemaVersion}`);
  }

  for (const path of catalog.paths) {
    register(path.id, `Path ${path.title}`);
    if (path.moduleIds.length === 0) errors.push(`Path ${path.id} has no modules`);
    if (new Set(path.moduleIds).size !== path.moduleIds.length) {
      errors.push(`Path ${path.id} references a module more than once`);
    }
    for (const moduleId of path.moduleIds) {
      if (!moduleIds.has(moduleId)) {
        errors.push(`Path ${path.id} references missing module ${moduleId}`);
      }
    }
  }

  for (const module of catalog.modules) {
    register(module.id, `Module ${module.title}`);
    validateProviders(module.providers, providerIds, `Module ${module.id}`, errors);
    if (module.objectives.length === 0) errors.push(`Module ${module.id} has no objectives`);
    if (module.sections.length === 0) errors.push(`Module ${module.id} has no sections`);
    validateSections(module.sections, `Module ${module.id}`, errors);
    validateActivity(module.activity, module.id, errors);
    validateComparisonMatrix(module.comparisonMatrix, module, errors);
    validateInstructorScript(module.instructorScript, module, errors, register);
    validateCapstone(module.capstone, module.id, errors, register);
    if (module.sources.length === 0) errors.push(`Module ${module.id} has no sources`);
    if (module.knowledgeCheck.questions.length === 0) {
      errors.push(`Module ${module.id} has no knowledge check`);
    }
    if (
      module.knowledgeCheck.passPercent < 0 ||
      module.knowledgeCheck.passPercent > 100
    ) {
      errors.push(`Module ${module.id} has an invalid pass percentage`);
    }
    for (const prerequisite of module.prerequisites) {
      if (!moduleIds.has(prerequisite)) {
        errors.push(`Module ${module.id} references missing prerequisite ${prerequisite}`);
      }
      if (prerequisite === module.id) {
        errors.push(`Module ${module.id} cannot require itself`);
      }
    }
    for (const question of module.knowledgeCheck.questions) {
      register(question.id, `Question in ${module.id}`);
      if (question.choices.length < 2) errors.push(`Question ${question.id} needs choices`);
      if (question.answerIndex < 0 || question.answerIndex >= question.choices.length) {
        errors.push(`Question ${question.id} has an invalid answer index`);
      }
      if (!question.explanation.trim()) {
        errors.push(`Question ${question.id} needs an explanation`);
      }
    }
    validateSources(module.sources, `Module ${module.id}`, errors);
  }

  for (const resource of catalog.resources) {
    register(resource.id, `Resource ${resource.title}`);
    validateProviders(resource.providers, providerIds, `Resource ${resource.id}`, errors);
    if (resource.sections.length === 0) errors.push(`Resource ${resource.id} has no sections`);
    validateSections(resource.sections, `Resource ${resource.id}`, errors);
    if (resource.sources.length === 0) errors.push(`Resource ${resource.id} has no sources`);
    if (!isDateOnly(resource.lastVerified)) {
      errors.push(`Resource ${resource.id} has an invalid lastVerified date`);
    }
    validateSources(resource.sources, `Resource ${resource.id}`, errors);
  }

  for (const moduleId of moduleIds) {
    if (!catalog.paths.some((path) => path.moduleIds.includes(moduleId))) {
      errors.push(`Module ${moduleId} is not assigned to a learning path`);
    }
  }

  validatePrerequisiteCycles(catalog.modules, errors);

  return { valid: errors.length === 0, errors };
}

function validateCapstone(
  capstone: CapstoneDefinition | undefined,
  moduleId: string,
  errors: string[],
  register: (id: string, location: string) => void,
) {
  if (!capstone) return;
  register(capstone.id, `Capstone in ${moduleId}`);
  if (!capstone.title.trim() || !capstone.summary.trim()) {
    errors.push(`Module ${moduleId} capstone needs a title and summary`);
  }
  if (
    capstone.requiredArtifacts.length === 0 ||
    capstone.requiredArtifacts.some((artifact) => !artifact.trim()) ||
    new Set(capstone.requiredArtifacts).size !== capstone.requiredArtifacts.length
  ) {
    errors.push(`Module ${moduleId} capstone needs unique required artifacts`);
  }
  if (
    capstone.rubric.passPercent < 0 ||
    capstone.rubric.passPercent > 100
  ) {
    errors.push(`Module ${moduleId} capstone has an invalid pass percentage`);
  }
  if (capstone.rubric.criteria.length < 3) {
    errors.push(`Module ${moduleId} capstone needs at least three rubric criteria`);
  }

  let totalPoints = 0;
  for (const criterion of capstone.rubric.criteria) {
    register(criterion.id, `Capstone criterion in ${moduleId}`);
    totalPoints += criterion.maxPoints;
    if (
      !criterion.title.trim() ||
      !criterion.description.trim() ||
      !Number.isInteger(criterion.maxPoints) ||
      criterion.maxPoints <= 0
    ) {
      errors.push(`Capstone criterion ${criterion.id} is incomplete`);
    }
    if (
      criterion.evidenceRequired.length === 0 ||
      criterion.evidenceRequired.some((evidence) => !evidence.trim())
    ) {
      errors.push(`Capstone criterion ${criterion.id} needs evidence requirements`);
    }
  }
  if (totalPoints !== 100) {
    errors.push(`Module ${moduleId} capstone rubric must total 100 points`);
  }

  validateCapstoneExemplars(capstone, moduleId, errors, register);
}

function validateCapstoneExemplars(
  capstone: CapstoneDefinition,
  moduleId: string,
  errors: string[],
  register: (id: string, location: string) => void,
) {
  const exemplars = capstone.exemplars ?? [];
  if (
    capstone.requiresCalibrationExemplars &&
    (exemplars.length !== 2 ||
      exemplars.filter((exemplar) => exemplar.kind === "complete").length !== 1 ||
      exemplars.filter((exemplar) => exemplar.kind === "flawed").length !== 1)
  ) {
    errors.push(
      `Module ${moduleId} capstone needs one complete and one flawed calibration exemplar`,
    );
  }

  const criteria = new Map(
    capstone.rubric.criteria.map((criterion) => [criterion.id, criterion]),
  );
  for (const exemplar of exemplars) {
    register(exemplar.id, `Capstone exemplar in ${moduleId}`);
    if (!exemplar.title.trim() || !exemplar.summary.trim()) {
      errors.push(`Capstone exemplar ${exemplar.id} needs a title and summary`);
    }

    const artifactRefs = exemplar.artifacts.map((artifact) => artifact.ref);
    const coversRequiredArtifacts = capstone.requiredArtifacts.every(
      (required) =>
        artifactRefs.some(
          (reference) =>
            reference === required || reference.endsWith(`/${required}`),
        ),
    );
    if (
      exemplar.artifacts.length < capstone.requiredArtifacts.length ||
      new Set(artifactRefs).size !== artifactRefs.length ||
      !coversRequiredArtifacts ||
      exemplar.artifacts.some(
        (artifact) =>
          !artifact.ref.trim() || !artifact.label.trim() || !artifact.content.trim(),
      )
    ) {
      errors.push(
        `Capstone exemplar ${exemplar.id} needs unique, complete required artifacts`,
      );
    }

    const scoredIds = exemplar.criterionScores.map((score) => score.criterionId);
    if (
      exemplar.criterionScores.length !== criteria.size ||
      new Set(scoredIds).size !== scoredIds.length
    ) {
      errors.push(
        `Capstone exemplar ${exemplar.id} must score every rubric criterion once`,
      );
    }

    let awarded = 0;
    for (const score of exemplar.criterionScores) {
      const criterion = criteria.get(score.criterionId);
      awarded += score.pointsAwarded;
      if (
        !criterion ||
        !Number.isInteger(score.pointsAwarded) ||
        score.pointsAwarded < 0 ||
        score.pointsAwarded > criterion.maxPoints ||
        !score.reviewerNote.trim() ||
        score.evidenceRefs.length === 0 ||
        new Set(score.evidenceRefs).size !== score.evidenceRefs.length ||
        score.evidenceRefs.some(
          (reference) =>
            !reference.trim() || !artifactRefs.includes(reference),
        )
      ) {
        errors.push(
          `Capstone exemplar ${exemplar.id} has invalid evidence for criterion ${score.criterionId}`,
        );
      }
    }

    const expectedScore = Math.round(awarded);
    const expectedPassed = expectedScore >= capstone.rubric.passPercent;
    if (
      exemplar.expectedScorePercent !== expectedScore ||
      exemplar.expectedPassed !== expectedPassed ||
      (exemplar.kind === "complete" && !expectedPassed) ||
      (exemplar.kind === "flawed" && expectedPassed)
    ) {
      errors.push(
        `Capstone exemplar ${exemplar.id} has inconsistent calibration results`,
      );
    }
  }
}

function validateActivity(
  activity: LearningActivity | undefined,
  moduleId: string,
  errors: string[],
) {
  if (!activity) return;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(activity.id)) {
    errors.push(`Module ${moduleId} has an invalid activity id: ${activity.id}`);
  }
  if (!activity.title.trim()) errors.push(`Module ${moduleId} activity needs a title`);
  if (
    activity.instructions.length === 0 ||
    activity.instructions.some((instruction) => !instruction.trim())
  ) {
    errors.push(`Module ${moduleId} activity needs non-empty instructions`);
  }
  if (
    activity.evidence.length === 0 ||
    activity.evidence.some((item) => !item.trim())
  ) {
    errors.push(`Module ${moduleId} activity needs observable evidence`);
  }
  if (!activity.reflectionPrompt.trim()) {
    errors.push(`Module ${moduleId} activity needs a reflection prompt`);
  }
}

function validateComparisonMatrix(
  matrix: ProviderComparisonMatrix | undefined,
  module: LearningModule,
  errors: string[],
) {
  if (!matrix) return;
  if (!isDateOnly(matrix.asOf)) {
    errors.push(`Module ${module.id} comparison matrix has an invalid asOf date`);
  }
  if (!matrix.caveat.trim()) {
    errors.push(`Module ${module.id} comparison matrix needs a caveat`);
  }
  if (matrix.dimensions.length === 0) {
    errors.push(`Module ${module.id} comparison matrix has no dimensions`);
    return;
  }

  const dimensionIds = new Set<string>();
  const moduleSourceUrls = new Set(module.sources.map((source) => source.url));
  const statuses = new Set<ComparisonStatus>([
    "documented",
    "changing",
    "non-equivalent",
    "unknown",
  ]);
  for (const dimension of matrix.dimensions) {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dimension.id) ||
      dimensionIds.has(dimension.id)
    ) {
      errors.push(
        `Module ${module.id} comparison matrix has an invalid or duplicate dimension id: ${dimension.id}`,
      );
    }
    dimensionIds.add(dimension.id);
    if (!dimension.title.trim() || !dimension.portableCore.trim()) {
      errors.push(
        `Module ${module.id} comparison dimension ${dimension.id} is incomplete`,
      );
    }

    for (const provider of ["anthropic", "openai", "google"] as const) {
      const cell = dimension.providers[provider];
      if (
        !cell ||
        !statuses.has(cell.status) ||
        !cell.summary.trim() ||
        cell.sourceUrls.length === 0 ||
        new Set(cell.sourceUrls).size !== cell.sourceUrls.length
      ) {
        errors.push(
          `Module ${module.id} comparison dimension ${dimension.id} has an incomplete ${provider} cell`,
        );
        continue;
      }
      for (const sourceUrl of cell.sourceUrls) {
        if (!moduleSourceUrls.has(sourceUrl)) {
          errors.push(
            `Module ${module.id} comparison dimension ${dimension.id} references an undeclared source: ${sourceUrl}`,
          );
        }
      }
    }
  }
}

function validateInstructorScript(
  script: InstructorScript | undefined,
  module: LearningModule,
  errors: string[],
  register: (id: string, location: string) => void,
) {
  if (!script) return;
  if (script.schemaVersion !== "1.0" && script.schemaVersion !== "1.1") {
    errors.push(`Module ${module.id} has an unsupported instructor script version`);
  }
  if (!Number.isInteger(script.estimatedSeconds) || script.estimatedSeconds <= 0) {
    errors.push(`Module ${module.id} has an invalid instructor script duration`);
  }
  if (script.cues.length === 0) {
    errors.push(`Module ${module.id} instructor script has no cues`);
    return;
  }

  const sectionIds = new Set(module.sections.map((section) => section.id));
  const cueKinds = new Set<InstructorCueKind>();
  for (const cue of script.cues) {
    register(cue.id, `Instructor cue in ${module.id}`);
    cueKinds.add(cue.kind);
    if (!cue.text.trim()) {
      errors.push(`Instructor cue ${cue.id} needs text`);
    }
    if (cue.sectionId && !sectionIds.has(cue.sectionId)) {
      errors.push(
        `Instructor cue ${cue.id} references missing section ${cue.sectionId}`,
      );
    }
    if (cue.kind === "visual" && !cue.accessibilityAlternative?.trim()) {
      errors.push(`Visual instructor cue ${cue.id} needs an accessibility alternative`);
    }
  }

  for (const section of module.sections) {
    if (
      !script.cues.some(
        (cue) => cue.sectionId === section.id && cue.kind === "narration",
      )
    ) {
      errors.push(
        `Module ${module.id} section ${section.id} needs an instructor narration cue`,
      );
    }
  }
  for (const required of [
    "narration",
    "visual",
    "learner-prompt",
    "checkpoint",
    "assessment-handoff",
  ] satisfies InstructorCueKind[]) {
    if (!cueKinds.has(required)) {
      errors.push(`Module ${module.id} instructor script needs a ${required} cue`);
    }
  }

  if (script.schemaVersion === "1.1") {
    if (!script.transcript?.trim()) {
      errors.push(`Module ${module.id} instructor script needs a transcript`);
    }
    if (!script.reducedMotionAlternative?.trim()) {
      errors.push(
        `Module ${module.id} instructor script needs a reduced-motion alternative`,
      );
    }
    if (!script.captions?.length) {
      errors.push(`Module ${module.id} instructor script needs captions`);
    } else {
      const cuesById = new Map(script.cues.map((cue) => [cue.id, cue]));
      const captionedCueIds = new Set<string>();
      let previousEnd = 0;
      for (const caption of script.captions) {
        if (
          !Number.isInteger(caption.startSeconds) ||
          !Number.isInteger(caption.endSeconds) ||
          caption.startSeconds < previousEnd ||
          caption.endSeconds <= caption.startSeconds ||
          caption.endSeconds > script.estimatedSeconds ||
          !caption.text.trim()
        ) {
          errors.push(
            `Module ${module.id} instructor script has an invalid caption`,
          );
        }
        previousEnd = caption.endSeconds;
        const cue = cuesById.get(caption.cueId);
        if (!cue) {
          errors.push(
            `Module ${module.id} caption references missing cue ${caption.cueId}`,
          );
        } else {
          captionedCueIds.add(caption.cueId);
          if (caption.text !== cue.text) {
            errors.push(
              `Module ${module.id} caption text differs from cue ${caption.cueId}`,
            );
          }
        }
      }
      for (const cue of script.cues.filter((cue) => cue.kind === "narration")) {
        if (!captionedCueIds.has(cue.id)) {
          errors.push(
            `Module ${module.id} narration cue ${cue.id} needs a caption`,
          );
        }
      }
    }

    for (const cue of script.cues.filter((cue) => cue.kind === "narration")) {
      if (!script.transcript?.includes(cue.text)) {
        errors.push(
          `Module ${module.id} transcript is missing narration cue ${cue.id}`,
        );
      }
    }
  }
}

function validateSections(
  sections: LessonSection[],
  location: string,
  errors: string[],
) {
  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id)) {
      errors.push(`${location} has an invalid section id: ${section.id}`);
    }
    if (sectionIds.has(section.id)) {
      errors.push(`${location} has duplicate section id ${section.id}`);
    }
    sectionIds.add(section.id);
    if (section.paragraphs.length === 0 || section.paragraphs.some((text) => !text.trim())) {
      errors.push(`${location} section ${section.id} needs non-empty paragraphs`);
    }
    if (
      section.code &&
      (!section.code.language.trim() ||
        !section.code.label.trim() ||
        !section.code.code.trim())
    ) {
      errors.push(`${location} section ${section.id} has an incomplete code example`);
    }
  }
}

function validatePrerequisiteCycles(
  modules: LearningModule[],
  errors: string[],
) {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const visited = new Set<string>();
  const active = new Set<string>();

  const visit = (moduleId: string) => {
    if (active.has(moduleId)) {
      errors.push(`Prerequisite cycle includes module ${moduleId}`);
      return;
    }
    if (visited.has(moduleId)) return;
    visited.add(moduleId);
    active.add(moduleId);
    for (const prerequisite of byId.get(moduleId)?.prerequisites ?? []) {
      if (byId.has(prerequisite)) visit(prerequisite);
    }
    active.delete(moduleId);
  };

  for (const module of modules) visit(module.id);
}

function validateProviders(
  providers: Provider[],
  knownProviders: Set<Provider>,
  location: string,
  errors: string[],
) {
  if (providers.length === 0) errors.push(`${location} has no providers`);
  for (const provider of providers) {
    if (!knownProviders.has(provider)) {
      errors.push(`${location} references missing provider ${provider}`);
    }
  }
}

function validateSources(
  sources: SourceReference[],
  location: string,
  errors: string[],
) {
  for (const source of sources) {
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:") {
        errors.push(`${location} source must use HTTPS: ${source.url}`);
      }
    } catch {
      errors.push(`${location} has an invalid source URL: ${source.url}`);
    }
    if (!isDateOnly(source.lastVerified)) {
      errors.push(`${location} source has an invalid lastVerified date: ${source.title}`);
    }
  }
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

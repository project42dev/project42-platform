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

export interface InstructorScript {
  schemaVersion: "1.0";
  estimatedSeconds: number;
  cues: InstructorCue[];
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
  instructorScript?: InstructorScript;
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
    validateInstructorScript(module.instructorScript, module, errors, register);
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

function validateInstructorScript(
  script: InstructorScript | undefined,
  module: LearningModule,
  errors: string[],
  register: (id: string, location: string) => void,
) {
  if (!script) return;
  if (script.schemaVersion !== "1.0") {
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

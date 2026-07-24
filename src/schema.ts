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

  return { valid: errors.length === 0, errors };
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

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

  const register = (id: string, location: string) => {
    if (!id.trim()) errors.push(`${location} has an empty id`);
    if (ids.has(id)) errors.push(`Duplicate content id: ${id}`);
    ids.add(id);
  };

  if (catalog.schemaVersion !== "1.0") {
    errors.push(`Unsupported schema version: ${catalog.schemaVersion}`);
  }

  for (const path of catalog.paths) {
    register(path.id, `Path ${path.title}`);
    if (path.moduleIds.length === 0) errors.push(`Path ${path.id} has no modules`);
    for (const moduleId of path.moduleIds) {
      if (!moduleIds.has(moduleId)) {
        errors.push(`Path ${path.id} references missing module ${moduleId}`);
      }
    }
  }

  for (const module of catalog.modules) {
    register(module.id, `Module ${module.title}`);
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
  }

  for (const resource of catalog.resources) {
    register(resource.id, `Resource ${resource.title}`);
    if (resource.sections.length === 0) errors.push(`Resource ${resource.id} has no sections`);
    if (resource.sources.length === 0) errors.push(`Resource ${resource.id} has no sources`);
  }

  return { valid: errors.length === 0, errors };
}

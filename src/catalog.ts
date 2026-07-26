import { generatedCatalog } from "./generated/catalog.js";
import type {
  Catalog,
  FieldGuideCatalog,
  LearningCatalog,
  LearningModule,
  LearningPath,
  Resource,
} from "./schema.js";

export const starterCatalog: Catalog = generatedCatalog;

export const learningCatalog: LearningCatalog = {
  schemaVersion: starterCatalog.schemaVersion,
  contentVersion: starterCatalog.contentVersion,
  title: "Project 42 Learn",
  description: "Provider-neutral learning paths, activities, and assessments.",
  providers: starterCatalog.providers,
  paths: starterCatalog.paths,
  modules: starterCatalog.modules,
};

export const fieldGuideCatalog: FieldGuideCatalog = {
  schemaVersion: starterCatalog.schemaVersion,
  contentVersion: starterCatalog.contentVersion,
  title: "Project 42 Field Guide",
  description: "Practical AI references, workflows, and decision support.",
  providers: starterCatalog.providers,
  resources: starterCatalog.resources,
};

export function getLearningPath(pathId: string): LearningPath | undefined {
  return learningCatalog.paths.find((path) => path.id === pathId);
}

export function getLearningModule(moduleId: string): LearningModule | undefined {
  return learningCatalog.modules.find((module) => module.id === moduleId);
}

export function getResource(resourceId: string): Resource | undefined {
  return fieldGuideCatalog.resources.find((resource) => resource.id === resourceId);
}

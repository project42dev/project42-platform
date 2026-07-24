import { generatedCatalog } from "./generated/catalog.js";
import type { Catalog, LearningModule, LearningPath, Resource } from "./schema.js";

export const starterCatalog: Catalog = generatedCatalog;

export function getLearningPath(pathId: string): LearningPath | undefined {
  return starterCatalog.paths.find((path) => path.id === pathId);
}

export function getLearningModule(moduleId: string): LearningModule | undefined {
  return starterCatalog.modules.find((module) => module.id === moduleId);
}

export function getResource(resourceId: string): Resource | undefined {
  return starterCatalog.resources.find((resource) => resource.id === resourceId);
}

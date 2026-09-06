// The catalogue this site renders.
//
// Every page reads its curriculum from here, and never from
// @project42/platform's `starterCatalog` directly. The difference matters: the
// platform's catalogue is the canonical Project 42 curriculum baked into the
// package, and an adopter's catalogue is that curriculum merged with the
// modules their own content repository publishes. Importing the platform's one
// in a page is how an adopter's module comes to exist, pass its own tests, and
// never appear on their site.
//
// `lib/siteCatalog.generated.ts` is written by `project42-portal materialise`
// from whichever of the two this deployment is entitled to -- the merged
// catalogue when project42.config.json declares content.customContentDir, the
// platform's own when it does not. A deployment that declares a content
// repository and cannot produce its catalogue fails the install; it never
// quietly falls back, because a site missing its operator's own content looks
// exactly like a site that has none.

import type {
  Catalog,
  FieldGuideCatalog,
  LearningCatalog,
  LearningModule,
  LearningPath,
  Resource,
} from "@project42/platform";
import { generatedSiteCatalog } from "./siteCatalog.generated";

// The generated module is a build input, and a build input that arrived wrong
// should say so where a developer is standing rather than render a half-empty
// site. The materialiser makes the same assertions; this is the second lock on
// the same door, for the case where the generated file is stale or hand-edited.
function assertCatalog(candidate: Catalog): Catalog {
  const problems: string[] = [];
  for (const key of ["paths", "modules", "resources", "providers"] as const) {
    if (!Array.isArray(candidate?.[key])) problems.push(`${key} is not an array`);
  }
  if (Array.isArray(candidate?.paths) && candidate.paths.length === 0) {
    problems.push("it declares no learning paths");
  }
  if (Array.isArray(candidate?.modules) && candidate.modules.length === 0) {
    problems.push("it declares no modules");
  }
  if (problems.length > 0) {
    throw new Error(
      `lib/siteCatalog.generated.ts is not a usable catalogue (${problems.join("; ")}). ` +
        "Rebuild it with `npm run app:materialise`; if this deployment has a content " +
        "repository, run `npm run content:build` there first.",
    );
  }
  return candidate;
}

export const siteCatalog: Catalog = assertCatalog(generatedSiteCatalog);

export const learningCatalog: LearningCatalog = {
  schemaVersion: siteCatalog.schemaVersion,
  contentVersion: siteCatalog.contentVersion,
  title: siteCatalog.title,
  description: siteCatalog.description,
  providers: siteCatalog.providers,
  paths: siteCatalog.paths,
  modules: siteCatalog.modules,
};

export const fieldGuideCatalog: FieldGuideCatalog = {
  schemaVersion: siteCatalog.schemaVersion,
  contentVersion: siteCatalog.contentVersion,
  title: siteCatalog.title,
  description: siteCatalog.description,
  providers: siteCatalog.providers,
  resources: siteCatalog.resources,
};

export function getLearningPath(pathId: string): LearningPath | undefined {
  return siteCatalog.paths.find((path) => path.id === pathId);
}

export function getLearningModule(moduleId: string): LearningModule | undefined {
  return siteCatalog.modules.find((module) => module.id === moduleId);
}

export function getResource(resourceId: string): Resource | undefined {
  return siteCatalog.resources.find((resource) => resource.id === resourceId);
}

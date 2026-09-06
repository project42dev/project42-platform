import { getLearningPath } from "@project42/platform";
import retiredPathConfig from "../../config/retired-learning-paths.json";

// Learning path IDs the catalogue used to publish.
//
// The catalogue was restructured several times before it settled on the current
// fourteen paths, and each restructure changed IDs rather than titles. Ten path
// IDs that were live on project-42.dev no longer resolve, and every module URL
// beneath them went with them - forty-three previously published URLs that
// answered 404 with no onward route.
//
// A 404 is the wrong answer here. The subject usually still exists; only its ID
// moved. So each retired ID redirects permanently to the path that inherited its
// material, and to the catalogue index only where nothing inherited it. The map
// is data in config/ rather than a constant in this file because the route
// inventory that drives the link check and the GitHub Pages export has to read
// the same list; a second copy would drift and republish the 404s.
export interface RetiredLearningPath {
  pathId: string;
  title: string;
  successorPathId: string | null;
  reason: string;
  retiredModuleIds: string[];
}

export const CATALOGUE_INDEX: string = retiredPathConfig.catalogueIndex;

export const retiredLearningPaths: RetiredLearningPath[] = Object.freeze(
  retiredPathConfig.retired as RetiredLearningPath[],
) as RetiredLearningPath[];

const byPathId = new Map(
  retiredLearningPaths.map((entry) => [entry.pathId, entry]),
);

export function getRetiredLearningPath(
  pathId: string,
): RetiredLearningPath | undefined {
  return byPathId.get(pathId);
}

/**
 * Where a retired path ID should send a learner, or undefined if the ID is not
 * retired (a genuinely unknown ID must still 404 - inventing a redirect for
 * every typo would make the catalogue unfalsifiable).
 *
 * When a moduleId is given and the successor path still carries a module of
 * that exact ID, the learner lands on the module they asked for. Otherwise they
 * land on the successor path, which lists what replaced it.
 */
export function retiredPathTarget(
  pathId: string,
  moduleId?: string,
): string | undefined {
  const entry = byPathId.get(pathId);
  if (!entry) return undefined;
  if (!entry.successorPathId) return CATALOGUE_INDEX;
  const successor = getLearningPath(entry.successorPathId);
  if (!successor) return CATALOGUE_INDEX;
  if (moduleId && successor.moduleIds.includes(moduleId)) {
    return `/learn/${successor.id}/${moduleId}`;
  }
  return `/learn/${successor.id}`;
}

/** Every previously published URL this map keeps alive, path and module alike. */
export function retiredLearningRoutes(): string[] {
  return retiredLearningPaths.flatMap((entry) => [
    `/learn/${entry.pathId}`,
    ...entry.retiredModuleIds.map(
      (moduleId) => `/learn/${entry.pathId}/${moduleId}`,
    ),
  ]);
}

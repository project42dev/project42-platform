import type { AssessmentResult } from "./assessment.js";
import type { Catalog } from "./schema.js";

export interface AssessmentAttempt {
  id: string;
  pathId: string;
  moduleId: string;
  contentVersion: string;
  scorePercent: number;
  passed: boolean;
  completedAt: string;
}

export interface EarnedBadge {
  id: string;
  name: string;
  description: string;
  earnedAt: string;
  evidenceModuleIds: string[];
}

export interface LearnerProgress {
  schemaVersion: 1;
  displayName: string;
  startedPathIds: string[];
  completedModuleIds: string[];
  attempts: AssessmentAttempt[];
  badges: EarnedBadge[];
  updatedAt: string;
}

export interface TranscriptEntry {
  pathId: string;
  pathTitle: string;
  completedModules: number;
  totalModules: number;
  completionPercent: number;
  bestScorePercent: number | null;
}

export function createEmptyProgress(displayName = "Explorer"): LearnerProgress {
  return {
    schemaVersion: 1,
    displayName,
    startedPathIds: [],
    completedModuleIds: [],
    attempts: [],
    badges: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export function recordAssessmentAttempt(
  progress: LearnerProgress,
  catalog: Catalog,
  input: {
    attemptId: string;
    pathId: string;
    moduleId: string;
    completedAt: string;
    result: AssessmentResult;
  },
): LearnerProgress {
  if (progress.attempts.some((attempt) => attempt.id === input.attemptId)) {
    return progress;
  }

  const startedPathIds = progress.startedPathIds.includes(input.pathId)
    ? progress.startedPathIds
    : [...progress.startedPathIds, input.pathId];
  const completedModuleIds =
    input.result.passed && !progress.completedModuleIds.includes(input.moduleId)
      ? [...progress.completedModuleIds, input.moduleId]
      : progress.completedModuleIds;
  const attempts = [
    ...progress.attempts,
    {
      id: input.attemptId,
      pathId: input.pathId,
      moduleId: input.moduleId,
      contentVersion: catalog.contentVersion,
      scorePercent: input.result.scorePercent,
      passed: input.result.passed,
      completedAt: input.completedAt,
    },
  ];
  const badges = deriveBadges(catalog, completedModuleIds, progress.badges, input.completedAt);

  return {
    ...progress,
    startedPathIds,
    completedModuleIds,
    attempts,
    badges,
    updatedAt: input.completedAt,
  };
}

export function deriveBadges(
  catalog: Catalog,
  completedModuleIds: string[],
  existing: EarnedBadge[],
  earnedAt: string,
): EarnedBadge[] {
  const badges = [...existing];
  for (const path of catalog.paths) {
    const completed = path.moduleIds.every((moduleId) => completedModuleIds.includes(moduleId));
    if (completed && !badges.some((badge) => badge.id === path.badge.id)) {
      badges.push({
        ...path.badge,
        earnedAt,
        evidenceModuleIds: [...path.moduleIds],
      });
    }
  }
  return badges;
}

export function buildTranscript(
  catalog: Catalog,
  progress: LearnerProgress,
): TranscriptEntry[] {
  return catalog.paths.map((path) => {
    const completed = path.moduleIds.filter((moduleId) =>
      progress.completedModuleIds.includes(moduleId),
    );
    const pathAttempts = progress.attempts.filter((attempt) => attempt.pathId === path.id);
    const bestScorePercent =
      pathAttempts.length === 0
        ? null
        : Math.max(...pathAttempts.map((attempt) => attempt.scorePercent));

    return {
      pathId: path.id,
      pathTitle: path.title,
      completedModules: completed.length,
      totalModules: path.moduleIds.length,
      completionPercent: Math.round((completed.length / path.moduleIds.length) * 100),
      bestScorePercent,
    };
  });
}

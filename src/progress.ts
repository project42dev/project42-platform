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

export interface CapstoneCriterionScore {
  criterionId: string;
  pointsAwarded: number;
  evidenceRefs?: string[];
}

export interface CapstoneSubmission {
  id: string;
  pathId: string;
  moduleId: string;
  contentVersion: string;
  submittedAt: string;
  artifactRefs: string[];
  criterionScores: CapstoneCriterionScore[];
  scorePercent: number;
  passed: boolean;
  reflection: string;
}

export interface EarnedBadge {
  id: string;
  name: string;
  description: string;
  earnedAt: string;
  evidenceModuleIds: string[];
}

export interface RecentModule {
  pathId: string;
  moduleId: string;
  visitedAt: string;
}

export interface LearnerProgress {
  schemaVersion: 1;
  displayName: string;
  startedPathIds: string[];
  completedModuleIds: string[];
  attempts: AssessmentAttempt[];
  capstoneSubmissions?: CapstoneSubmission[];
  badges: EarnedBadge[];
  recentModule?: RecentModule;
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

export interface AssessmentHistoryEntry {
  attemptId: string;
  pathId: string;
  pathTitle: string;
  moduleId: string;
  moduleTitle: string;
  scorePercent: number;
  passed: boolean;
  completedAt: string;
  contentVersion: string;
}

export interface CapstoneHistoryEntry extends CapstoneSubmission {
  pathTitle: string;
  moduleTitle: string;
  capstoneTitle: string;
}

export function createEmptyProgress(displayName = "Explorer"): LearnerProgress {
  return {
    schemaVersion: 1,
    displayName,
    startedPathIds: [],
    completedModuleIds: [],
    attempts: [],
    capstoneSubmissions: [],
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

  const path = catalog.paths.find((candidate) => candidate.id === input.pathId);
  const module = catalog.modules.find((candidate) => candidate.id === input.moduleId);
  if (!path || !module || !path.moduleIds.includes(module.id)) {
    throw new Error(
      `Module ${input.moduleId} does not belong to learning path ${input.pathId}`,
    );
  }

  const startedPathIds = progress.startedPathIds.includes(input.pathId)
    ? progress.startedPathIds
    : [...progress.startedPathIds, input.pathId];
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
  const capstoneSubmissions = progress.capstoneSubmissions ?? [];
  const completedModuleIds =
    input.result.passed &&
    (!module.capstone ||
      capstoneSubmissions.some(
        (submission) => submission.moduleId === module.id && submission.passed,
      )) &&
    !progress.completedModuleIds.includes(input.moduleId)
      ? [...progress.completedModuleIds, input.moduleId]
      : progress.completedModuleIds;
  const badges = deriveBadges(catalog, completedModuleIds, progress.badges, input.completedAt);

  return {
    ...progress,
    startedPathIds,
    completedModuleIds,
    attempts,
    capstoneSubmissions,
    badges,
    updatedAt: input.completedAt,
  };
}

export function recordCapstoneSubmission(
  progress: LearnerProgress,
  catalog: Catalog,
  input: {
    submissionId: string;
    pathId: string;
    moduleId: string;
    submittedAt: string;
    artifactRefs: string[];
    criterionScores: CapstoneCriterionScore[];
    reflection: string;
  },
): LearnerProgress {
  const existing = progress.capstoneSubmissions ?? [];
  if (existing.some((submission) => submission.id === input.submissionId)) {
    return progress;
  }

  const path = catalog.paths.find((candidate) => candidate.id === input.pathId);
  const module = catalog.modules.find((candidate) => candidate.id === input.moduleId);
  if (!path || !module || !path.moduleIds.includes(module.id) || !module.capstone) {
    throw new Error(
      `Module ${input.moduleId} is not a capstone in learning path ${input.pathId}`,
    );
  }
  if (
    input.artifactRefs.length < module.capstone.requiredArtifacts.length ||
    input.artifactRefs.some((reference) => !reference.trim()) ||
    !input.reflection.trim()
  ) {
    throw new Error(
      `Capstone submission needs at least ${module.capstone.requiredArtifacts.length} artifact references and a reflection`,
    );
  }

  const scoreByCriterion = new Map(
    input.criterionScores.map((score) => [score.criterionId, score]),
  );
  if (
    scoreByCriterion.size !== module.capstone.rubric.criteria.length ||
    input.criterionScores.length !== module.capstone.rubric.criteria.length
  ) {
    throw new Error("Capstone submission must score every rubric criterion once");
  }

  let awarded = 0;
  let available = 0;
  const artifactRefs = new Set(input.artifactRefs);
  const assessmentRefs = new Set(
    progress.attempts
      .filter(
        (attempt) =>
          attempt.pathId === path.id && attempt.moduleId === module.id,
      )
      .map((attempt) => `assessment:${attempt.id}`),
  );
  for (const criterion of module.capstone.rubric.criteria) {
    const score = scoreByCriterion.get(criterion.id);
    if (
      !score ||
      !Number.isInteger(score.pointsAwarded) ||
      score.pointsAwarded < 0 ||
      score.pointsAwarded > criterion.maxPoints
    ) {
      throw new Error(`Invalid score for capstone criterion ${criterion.id}`);
    }
    if (
      module.capstone.requiresCriterionEvidence &&
      (!score.evidenceRefs?.length ||
        new Set(score.evidenceRefs).size !== score.evidenceRefs.length ||
        score.evidenceRefs.some(
          (reference) =>
            !reference.trim() ||
            (!artifactRefs.has(reference) && !assessmentRefs.has(reference)),
        ))
    ) {
      throw new Error(
        `Capstone criterion ${criterion.id} needs mapped artifact or assessment evidence`,
      );
    }
    awarded += score.pointsAwarded;
    available += criterion.maxPoints;
  }
  const scorePercent = Math.round((awarded / available) * 100);
  const passed = scorePercent >= module.capstone.rubric.passPercent;
  const submission: CapstoneSubmission = {
    id: input.submissionId,
    pathId: input.pathId,
    moduleId: input.moduleId,
    contentVersion: catalog.contentVersion,
    submittedAt: input.submittedAt,
    artifactRefs: [...input.artifactRefs],
    criterionScores: input.criterionScores.map((score) => ({ ...score })),
    scorePercent,
    passed,
    reflection: input.reflection,
  };
  const capstoneSubmissions = [...existing, submission];
  const hasPassingCheck = progress.attempts.some(
    (attempt) => attempt.moduleId === module.id && attempt.passed,
  );
  const completedModuleIds =
    passed &&
    hasPassingCheck &&
    !progress.completedModuleIds.includes(module.id)
      ? [...progress.completedModuleIds, module.id]
      : progress.completedModuleIds;
  const startedPathIds = progress.startedPathIds.includes(path.id)
    ? progress.startedPathIds
    : [...progress.startedPathIds, path.id];

  return {
    ...progress,
    startedPathIds,
    completedModuleIds,
    capstoneSubmissions,
    badges: deriveBadges(
      catalog,
      completedModuleIds,
      progress.badges,
      input.submittedAt,
    ),
    updatedAt: input.submittedAt,
  };
}

export function recordModuleVisit(
  progress: LearnerProgress,
  catalog: Catalog,
  input: {
    pathId: string;
    moduleId: string;
    visitedAt: string;
  },
): LearnerProgress {
  const path = catalog.paths.find((candidate) => candidate.id === input.pathId);
  if (!path || !path.moduleIds.includes(input.moduleId)) {
    throw new Error(
      `Module ${input.moduleId} does not belong to learning path ${input.pathId}`,
    );
  }

  const startedPathIds = progress.startedPathIds.includes(input.pathId)
    ? progress.startedPathIds
    : [...progress.startedPathIds, input.pathId];

  return {
    ...progress,
    startedPathIds,
    recentModule: {
      pathId: input.pathId,
      moduleId: input.moduleId,
      visitedAt: input.visitedAt,
    },
    updatedAt: input.visitedAt,
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

export function buildAssessmentHistory(
  catalog: Catalog,
  progress: LearnerProgress,
): AssessmentHistoryEntry[] {
  const pathTitles = new Map(catalog.paths.map((path) => [path.id, path.title]));
  const moduleTitles = new Map(
    catalog.modules.map((module) => [module.id, module.title]),
  );

  return progress.attempts
    .map((attempt) => ({
      attemptId: attempt.id,
      pathId: attempt.pathId,
      pathTitle: pathTitles.get(attempt.pathId) ?? attempt.pathId,
      moduleId: attempt.moduleId,
      moduleTitle: moduleTitles.get(attempt.moduleId) ?? attempt.moduleId,
      scorePercent: attempt.scorePercent,
      passed: attempt.passed,
      completedAt: attempt.completedAt,
      contentVersion: attempt.contentVersion,
    }))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
}

export function buildCapstoneHistory(
  catalog: Catalog,
  progress: LearnerProgress,
): CapstoneHistoryEntry[] {
  const pathTitles = new Map(catalog.paths.map((path) => [path.id, path.title]));
  const modules = new Map(catalog.modules.map((module) => [module.id, module]));

  return (progress.capstoneSubmissions ?? [])
    .map((submission) => {
      const module = modules.get(submission.moduleId);
      return {
        ...submission,
        pathTitle: pathTitles.get(submission.pathId) ?? submission.pathId,
        moduleTitle: module?.title ?? submission.moduleId,
        capstoneTitle: module?.capstone?.title ?? submission.moduleId,
      };
    })
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}

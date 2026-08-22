export interface ModuleProgress {
  moduleId: string;
  pathId: string;
  completed: boolean;
  score?: number;
  completedAt?: string;
  quizAttempts?: Array<{
    score: number;
    total: number;
    passed: boolean;
    attemptedAt: string;
  }>;
}

export interface LearnerState {
  version: string;
  modules: Record<string, ModuleProgress>;
  badges: Array<{
    id: string;
    title: string;
    earnedAt: string;
    pathId: string;
  }>;
}

const STORAGE_KEY = 'project42_learner_progress_v1';

export function getLearnerState(): LearnerState {
  if (typeof window === 'undefined') return { version: '1.0', modules: {}, badges: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: '1.0', modules: {}, badges: [] };
    return JSON.parse(raw);
  } catch {
    return { version: '1.0', modules: {}, badges: [] };
  }
}

export function saveModuleProgress(progress: ModuleProgress): LearnerState {
  const state = getLearnerState();
  state.modules[progress.moduleId] = progress;
  
  // Evaluate path badge completion
  if (progress.completed) {
    const existingBadge = state.badges.find(b => b.pathId === progress.pathId);
    if (!existingBadge) {
      state.badges.push({
        id: `badge-${progress.pathId}`,
        title: `${progress.pathId.toUpperCase()} Mastery`,
        earnedAt: new Date().toISOString(),
        pathId: progress.pathId
      });
    }
  }
  
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  return state;
}

export function resetProgress(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

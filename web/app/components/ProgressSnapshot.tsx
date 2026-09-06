"use client";

import Link from "next/link";
import { progressCatalog } from "../../lib/progressCatalog";
import { useProgress } from "./ProgressProvider";

export function ProgressSnapshot() {
  const { progress, hydrated } = useProgress();
  const completed = progress.completedModuleIds.length;
  const total = progressCatalog.modules.length;
  const recentModule = progress.recentModule
    ? progressCatalog.modules.find(
      (module) => module.id === progress.recentModule?.moduleId,
    )
    : undefined;

  if (!hydrated || (completed === 0 && !recentModule)) {
    return (
      <section className="progress-snapshot shell" aria-label="Learning progress">
        <div>
          <span className="snapshot-kicker">Your learning record</span>
          <strong>Ready when you are.</strong>
        </div>
        <p>Sign in to save progress, scores, and badges to your account.</p>
        <Link href="/account">Sign in to start →</Link>
      </section>
    );
  }

  return (
    <section className="progress-snapshot shell" aria-label="Learning progress">
      <div>
        <span className="snapshot-kicker">Welcome back, {progress.displayName}</span>
        <strong>
          {completed} of {total} modules complete
        </strong>
      </div>
      <div
        className="mini-progress"
        role="progressbar"
        aria-label="Total module progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
      >
        <span style={{ width: `${Math.round((completed / total) * 100)}%` }} />
      </div>
      {recentModule && progress.recentModule ? (
        <Link
          href={`/learn/${progress.recentModule.pathId}/${progress.recentModule.moduleId}`}
        >
          Continue {recentModule.title} →
        </Link>
      ) : (
        <Link href="/profile">View transcript →</Link>
      )}
    </section>
  );
}

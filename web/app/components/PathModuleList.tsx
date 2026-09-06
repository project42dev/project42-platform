"use client";

import Link from "next/link";
import type { LearningModule } from "@project42/platform";
import { useProgress } from "./ProgressProvider";

export function PathModuleList({
  pathId,
  modules,
}: {
  pathId: string;
  modules: LearningModule[];
}) {
  const { progress, hydrated } = useProgress();

  return (
    <ol className="module-list">
      {modules.map((module, index) => {
        const complete = hydrated && progress.completedModuleIds.includes(module.id);
        const best = progress.attempts
          .filter((attempt) => attempt.moduleId === module.id)
          .reduce<number | null>(
            (current, attempt) =>
              current === null ? attempt.scorePercent : Math.max(current, attempt.scorePercent),
            null,
          );
        return (
          <li className={complete ? "module-complete" : ""} key={module.id}>
            <Link href={`/learn/${pathId}/${module.id}`}>
              <span className="module-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="module-copy">
                <small>
                  {module.estimatedMinutes} min · {module.level}
                </small>
                <strong>{module.title}</strong>
                <span>{module.summary}</span>
              </span>
              <span className="module-state">
                {complete ? `Complete${best === null ? "" : ` · ${best}%`}` : "Begin →"}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

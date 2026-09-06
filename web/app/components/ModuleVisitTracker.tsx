"use client";

import { useEffect } from "react";
import { useProgress } from "./ProgressProvider";

export function ModuleVisitTracker({
  pathId,
  moduleId,
}: {
  pathId: string;
  moduleId: string;
}) {
  const { hydrated, recordVisit } = useProgress();

  useEffect(() => {
    if (!hydrated) return;
    const visitTimer = window.setTimeout(() => recordVisit(pathId, moduleId), 0);
    return () => window.clearTimeout(visitTimer);
  }, [hydrated, moduleId, pathId, recordVisit]);

  return null;
}

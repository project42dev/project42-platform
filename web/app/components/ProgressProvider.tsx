"use client";

import {
  ACCOUNT_BACKED_PROGRESS_SOURCE,
  createEmptyProgress,
  recordAssessmentAttempt,
  recordCapstoneSubmission,
  recordModuleVisit,
  type AssessmentResult,
  type CapstoneCriterionScore,
  type LearnerProgress,
} from "@project42/platform";
import { progressCatalog } from "../../lib/progressCatalog";
import { hasLearningEvidence } from "../lib/progressMigration";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider";

type SyncStatus =
  | "local-only"
  | "checking"
  | "syncing"
  | "synced"
  | "blocked"
  | "error";

interface ProgressContextValue {
  progress: LearnerProgress;
  hydrated: boolean;
  syncStatus: SyncStatus;
  recordResult: (pathId: string, moduleId: string, result: AssessmentResult) => void;
  recordCapstone: (
    pathId: string,
    moduleId: string,
    artifactRefs: string[],
    criterionScores: CapstoneCriterionScore[],
    reflection: string,
  ) => void;
  recordVisit: (pathId: string, moduleId: string) => void;
  replaceProgress: (progress: LearnerProgress) => void;
  rename: (displayName: string) => void;
  reset: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

/**
 * In-memory buffer for progress changes that haven't been flushed to the API yet.
 * This is NOT device-local persistence — it's a short-lived buffer that exists only
 * while the tab is open, used to survive transient network flakiness.
 *
 * Structure: Map<serializedProgress, LearnerProgress>
 * We key by serialized JSON so we only keep the latest version of each distinct state.
 * On successful API flush, the entry is cleared. On reconnect after a network error,
 * the buffer is drained.
 */
interface BufferEntry {
  progress: LearnerProgress;
  timestamp: number;
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { account, apiFetch } = useAuth();
  const [progress, setProgress] = useState<LearnerProgress>(() => createEmptyProgress());
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local-only");

  const lastSynchronized = useRef("");
  const currentProgress = useRef(progress);
  const syncEnabled = useRef(false);
  const flushInFlight = useRef(false);

  // In-memory buffer: holds the latest unsynced progress when the network is flaky.
  // Cleared on successful flush. Never read as a source of truth on mount.
  const unsyncedBuffer = useRef<BufferEntry | null>(null);

  // HYDRATION RETRY. A failed read used to be terminal for the whole session.
  // syncEnabled is set only inside the success handler below, and the sync
  // effect returns early without it, so a single failed GET /v1/me/progress
  // both blanked the learner's page and silently stopped every later change
  // from ever being written. On 2026-09-09 the owner completed a module and
  // nothing whatsoever reached D1: module_progress held zero rows while his
  // own user row showed he had signed in that day.
  //
  // Retrying is the fix. Dropping the syncEnabled gate is NOT: that gate is
  // protective, because writing before a successful read would push empty
  // progress over the learner's real remote record and destroy it. Keep the
  // gate, make the read keep trying.
  const hydrationAttempt = useRef(0);
  const [hydrationRetry, setHydrationRetry] = useState(0);

  useEffect(() => {
    currentProgress.current = progress;
  }, [progress]);

  // Hydration: if an approved account is connected, fetch progress from the API.
  // Otherwise, start with empty progress. No localStorage reads.
  useEffect(() => {
    let cancelled = false;
    const hydrationTimer = window.setTimeout(() => {
      if (cancelled) return;

      if (!account || account.state !== "approved") {
        setProgress(createEmptyProgress());
        setHydrated(true);
        setSyncStatus("local-only");
        return;
      }

      setSyncStatus("checking");
      const controller = new AbortController();
      void apiFetch("/v1/me/progress", { signal: controller.signal })
        .then(async (response) => {
          if (cancelled) return;
          const body = (await response.json()) as {
            progress?: {
              revision: number;
              progress: LearnerProgress;
            };
            error?: { message?: string };
          };
          if (!response.ok || !body.progress) {
            throw new Error(body.error?.message ?? "Account progress could not be loaded.");
          }
          const remote = body.progress.progress;
          const normalized = {
            ...remote,
            capstoneSubmissions: remote.capstoneSubmissions ?? [],
          };
          lastSynchronized.current = JSON.stringify(normalized);
          setProgress(normalized);
          syncEnabled.current = true;
          hydrationAttempt.current = 0;
          setSyncStatus("synced");
          setHydrated(true);
          // A read that succeeds after earlier failures makes the session
          // writable again; the reconnect effect below drains anything the
          // learner completed while it was down.
        })
        .catch((caught) => {
          if (cancelled) return;
          if (caught instanceof DOMException && caught.name === "AbortError") return;

          // The account remains the source of truth, so we still do not write
          // and we still show nothing we cannot vouch for -- but only on the
          // FIRST attempt do we clear the view. Work the learner does while we
          // are retrying is kept in memory and buffered, so a read that
          // succeeds on a later attempt flushes it instead of losing it.
          if (hydrationAttempt.current === 0) {
            setProgress(createEmptyProgress());
          } else if (hasLearningEvidence(currentProgress.current)) {
            unsyncedBuffer.current = {
              progress: currentProgress.current,
              timestamp: Date.now(),
            };
          }
          setSyncStatus("error");
          setHydrated(true);

          // Back off: 1s, 2s, 4s, 8s, 16s, then every 30s. A learner who leaves
          // the tab open through a deploy or a dropped connection recovers on
          // their own, and every module they complete meanwhile still lands.
          hydrationAttempt.current += 1;
          const attempt = hydrationAttempt.current;
          const delay = attempt <= 5 ? 1000 * 2 ** (attempt - 1) : 30000;
          window.setTimeout(() => {
            if (cancelled) return;
            setHydrationRetry((value) => value + 1);
          }, delay);
        });

      return () => {
        controller.abort();
      };
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(hydrationTimer);
    };
  }, [account, apiFetch, hydrationRetry]);

  // Sync: when progress changes and we have an approved account, push to API.
  // On network error, buffer the unsynced progress in memory.
  useEffect(() => {
    if (!hydrated || !account || account.state !== "approved") {
      return;
    }
    // Not yet writable, because no read has succeeded. Returning here used to
    // DROP the change on the floor: the learner passed a knowledge check, the
    // state updated in memory, and nothing ever recorded it. Buffer it instead,
    // so the first successful hydration flushes it.
    if (!syncEnabled.current) {
      if (hasLearningEvidence(progress)) {
        unsyncedBuffer.current = { progress, timestamp: Date.now() };
      }
      return;
    }
    const serialized = JSON.stringify(progress);
    if (serialized === lastSynchronized.current) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSyncStatus("syncing");
      flushInFlight.current = true;
      void apiFetch("/v1/me/progress", {
        method: "PUT",
        signal: controller.signal,
        body: JSON.stringify({
          importId: crypto.randomUUID(),
          // Shared with the worker's allow-list. Do not inline the literal:
          // a hardcoded copy here that the worker did not accept is what made
          // every save 400 and left production module_progress empty.
          source: ACCOUNT_BACKED_PROGRESS_SOURCE,
          progress,
        }),
      })
        .then(async (response) => {
          flushInFlight.current = false;
          if (!response.ok) {
            const body = (await response.json()) as { error?: { message?: string } };
            throw new Error(body.error?.message ?? "Progress could not be synchronized.");
          }
          lastSynchronized.current = serialized;
          // Clear the in-memory buffer on successful flush
          unsyncedBuffer.current = null;
          setSyncStatus("synced");
        })
        .catch((caught) => {
          flushInFlight.current = false;
          if (caught instanceof DOMException && caught.name === "AbortError") return;
          // Buffer the unsynced progress in memory so it can be retried on reconnect
          unsyncedBuffer.current = {
            progress: currentProgress.current,
            timestamp: Date.now(),
          };
          setSyncStatus("error");
        });
    }, 800);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [account, apiFetch, hydrated, progress]);

  // Reconnect: when syncStatus transitions from "error" back to "synced" (e.g. after
  // a page reload or account re-auth), flush any buffered progress.
  useEffect(() => {
    if (
      syncStatus !== "synced" ||
      !syncEnabled.current ||
      !unsyncedBuffer.current ||
      flushInFlight.current
    ) {
      return;
    }
    const buffered = unsyncedBuffer.current;
    // Only flush if the buffer is newer than what we last synced
    const bufferedSerialized = JSON.stringify(buffered.progress);
    if (bufferedSerialized === lastSynchronized.current) {
      unsyncedBuffer.current = null;
      return;
    }
    // Apply the buffered progress, which will trigger the sync effect above
    setProgress(buffered.progress);
    unsyncedBuffer.current = null;
  }, [syncStatus]);

  const recordResult = useCallback(
    (pathId: string, moduleId: string, result: AssessmentResult) => {
      const completedAt = new Date().toISOString();
      const attemptId =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${moduleId}-${Date.now()}`;
      setProgress((current) =>
        recordAssessmentAttempt(current, progressCatalog, {
          attemptId,
          pathId,
          moduleId,
          completedAt,
          result,
        }),
      );
    },
    [],
  );

  const recordVisit = useCallback((pathId: string, moduleId: string) => {
    const visitedAt = new Date().toISOString();
    setProgress((current) =>
      recordModuleVisit(current, progressCatalog, {
        pathId,
        moduleId,
        visitedAt,
      }),
    );
  }, []);

  const recordCapstone = useCallback(
    (
      pathId: string,
      moduleId: string,
      artifactRefs: string[],
      criterionScores: CapstoneCriterionScore[],
      reflection: string,
    ) => {
      const submittedAt = new Date().toISOString();
      const submissionId =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${moduleId}-capstone-${Date.now()}`;
      setProgress((current) =>
        recordCapstoneSubmission(current, progressCatalog, {
          submissionId,
          pathId,
          moduleId,
          submittedAt,
          artifactRefs,
          criterionScores,
          reflection,
        }),
      );
    },
    [],
  );

  const rename = useCallback((displayName: string) => {
    setProgress((current) => ({
      ...current,
      displayName: displayName.trim() || "Explorer",
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const replaceProgress = useCallback(
    (replacement: LearnerProgress) => {
      const next = structuredClone(replacement);
      if (account?.state === "approved") {
        // When account-backed, the API is authoritative. Replace locally and let
        // the sync effect push it. If the API rejects it, the next hydration will
        // restore the server state.
        lastSynchronized.current = "";
        setProgress(next);
        return;
      }
      // No account: just set in-memory state
      setProgress(next);
    },
    [account],
  );

  const reset = useCallback(() => {
    setProgress(createEmptyProgress());
  }, []);

  const value = useMemo(
    () => ({
      progress,
      hydrated,
      syncStatus,
      recordResult,
      recordCapstone,
      recordVisit,
      replaceProgress,
      rename,
      reset,
    }),
    [
      progress,
      hydrated,
      syncStatus,
      recordResult,
      recordCapstone,
      recordVisit,
      replaceProgress,
      rename,
      reset,
    ],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) throw new Error("useProgress must be used inside ProgressProvider");
  return context;
}

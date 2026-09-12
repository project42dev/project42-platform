"use client";

import {
  ACCOUNT_BACKED_PROGRESS_SOURCE,
  createEmptyProgress,
  planAccountProgressHydration,
  planUnsyncedProgressFlush,
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
  clearDeviceLocalProgress,
  readDeviceLocalProgress,
  writeDeviceLocalProgress,
} from "../lib/deviceLocalProgress";
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

/**
 * The browser's own store, or null where there isn't one (SSR, and a browser
 * that refuses localStorage outright -- Safari with site data blocked throws on
 * the property access itself, not merely on setItem).
 */
function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
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

  // REMEMBERING THE PLACE, SIGNED IN OR NOT.
  //
  // Until 2026-09-12 this effect's comment read "start with empty progress. No
  // localStorage reads", and it meant it: a signed-out visitor who read half a
  // module and came back the next day was met by a site that had never heard of
  // them, and a signed-in learner's place depended entirely on the account
  // round-trip landing. web/app/lib/deviceLocalProgress.ts had a reader,
  // a validator and a quarantine path since the front end shipped, and nothing
  // called any of it.
  //
  // Now:
  //
  // SIGNED OUT -- the device record IS the record. Read it, validate it through
  // the existing reader (a record this catalogue cannot vouch for is
  // quarantined, not shown), and hydrate from it. `setProgress` and
  // `setHydrated` land in one batch so the write effect below never sees the
  // empty initial state and overwrite the stored record with it.
  //
  // SIGNED IN -- the account is the source of truth, and the device record is
  // seeded into state ONCE before the GET resolves so that the read's own
  // merge, planAccountProgressHydration, folds it into the account record
  // through mergeLearnerProgress. That is the existing merge path and not a new
  // mechanism: the account is the survivor, so its whole history is kept; the
  // device record is the source, so a place the learner reached before signing
  // in is added; `recentModule` resolves by the later `visitedAt` inside the
  // merge. Once an account has taken over, the device key is cleared and the
  // write effect below stops writing -- an account record must not sit in a
  // shared browser after the session ends.
  const deviceRecordSeeded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const hydrationTimer = window.setTimeout(() => {
      if (cancelled) return;

      const storage = deviceStorage();

      if (!account || account.state !== "approved") {
        // A session still resolving is NOT yet a signed-out visitor. Hydrating
        // from the device record here is still right -- it is this browser's
        // own record either way -- and if an account lands a moment later the
        // seed below has already happened, which is what the account merge
        // wants. What must not happen is treating "loading" as "nobody", which
        // is why the storage read is unconditional rather than gated on it.
        const stored = storage
          ? readDeviceLocalProgress(storage, progressCatalog)
          : ({ status: "missing" } as const);
        if (stored.status === "valid") deviceRecordSeeded.current = true;
        setProgress(
          stored.status === "valid" ? stored.progress : createEmptyProgress(),
        );
        setHydrated(true);
        setSyncStatus("local-only");
        return;
      }

      // Signed in. Seed the device record into state once, so the account read
      // below merges it rather than arriving to an empty session and having
      // nothing of the learner's pre-sign-in place to keep.
      //
      // ON A NORMAL PAGE LOAD THIS IS A FALLBACK, NOT THE MECHANISM, and that
      // was measured rather than assumed. AuthProvider starts at status
      // "loading" with a null account, so the no-account branch above runs
      // FIRST on every load and has already put the device record into state by
      // the time an account lands here; `deviceRecordSeeded` is true and this
      // block is skipped. Disabling this block alone changes nothing that any
      // test can see. Disabling the read above alone also changes nothing for a
      // signed-in learner, because then this block is the one that runs. It
      // takes disabling BOTH to lose the hand-off -- which is what
      // resume-where-you-left-off.spec.ts was checked against.
      //
      // It is kept because the two are not the same condition: the branch above
      // fires when there is no approved account, this one when there is. An
      // AuthProvider that ever resolved an account without passing through a
      // null-account render -- a cached session, a server-rendered identity --
      // would skip the branch above entirely, and this is what keeps the
      // hand-off working when it does.
      if (!deviceRecordSeeded.current) {
        deviceRecordSeeded.current = true;
        const stored = storage
          ? readDeviceLocalProgress(storage, progressCatalog)
          : ({ status: "missing" } as const);
        if (stored.status === "valid") {
          setProgress(stored.progress);
        }
      }
      // NOTE: the device key is NOT cleared here. It is cleared in the read's
      // success handler below, once the account has actually taken the record
      // over. Clearing it at this point would lose the learner's place outright
      // on the sequence that matters most -- sign in (an OIDC redirect, so a
      // full page load), GET /v1/me/progress fails, learner reloads: the seed
      // above is gone with the old page, the in-memory buffer went with it, and
      // the key that still held their place would have been deleted by a hand-
      // off that never completed.
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
          // HYDRATION MUST NOT DISCARD WORK ALREADY DONE THIS SESSION.
          // Until 2026-09-11 this line handed the normalized account record
          // straight to the state setter: a plain replace. Nothing gates the
          // learner's interaction on the read finishing, so a knowledge check
          // answered while this GET was in flight recorded its attempt and
          // completion into state, and then this handler threw both away when
          // the response landed.
          //
          // On the FIRST read the buffer below covers that: the sync effect
          // re-runs when the account lands, cannot write yet, and buffers, and
          // the reconnect flush merges it back. It is the SECOND read and
          // every one after -- a re-hydration, which this effect performs
          // every time the `account` object changes identity, and AuthProvider
          // hands it a new one whenever the scheduled session renewal comes
          // back 409 -- that was destroying work outright. `syncEnabled` is
          // true by then, so the change takes the debounced-save path instead
          // of the buffer, and this replace cancels that pending save as it
          // goes: nothing buffered, nothing written, nothing said. Mid-session,
          // while the learner is working. A fast local server makes the window
          // small; a phone on a contended network holds it open for seconds.
          //
          // planAccountProgressHydration merges instead, through the same
          // mergeLearnerProgress call the reconnect flush uses: the account is
          // the survivor so its whole history is kept, the in-session record is
          // the source so its evidence is added, and an in-session attempt whose
          // id collides with a different account attempt is kept under the
          // "unsynced:" prefix rather than dropped. `lastSynchronized` stays the
          // account record below, so when the merge adds anything the sync
          // effect writes the result back and the learner's work reaches D1.
          // When the learner has done nothing yet the updater returns the
          // account record itself and no write is provoked.
          lastSynchronized.current = JSON.stringify(normalized);
          setProgress(planAccountProgressHydration(normalized));
          // THE HAND-OFF IS COMPLETE, so the device copy goes. The account has
          // the record, the merge above has folded in whatever the device
          // seeded, and the sync effect writes the result back. Leaving the key
          // behind would be a copy of learner progress that the profile page
          // cannot show and the account-deletion workflow cannot reach, sitting
          // in what may be a shared browser.
          //
          // This is deliberately AFTER the read succeeds rather than before it.
          // What remains is the GET-ok / PUT-fail / reload window, where the
          // merged record is lost -- but that window is not new and not made
          // worse here: it is the same one every in-session change already has,
          // and the unsynced buffer and hydration retry exist to narrow it.
          {
            const accountStorage = deviceStorage();
            if (accountStorage) clearDeviceLocalProgress(accountStorage);
          }
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
          // and we still show nothing we cannot vouch for -- but we clear the
          // view only when there is nothing of the learner's in it. Work the
          // learner does while we are retrying is kept in memory and buffered,
          // so a read that succeeds on a later attempt flushes it instead of
          // losing it.
          //
          // The evidence test used to come second, behind
          // `hydrationAttempt.current === 0`. That did not lose the work --
          // the sync effect had already buffered it, and blanking state with
          // an empty record left the buffer alone -- but it took the learner's
          // progress off their screen for the whole backoff, up to thirty
          // seconds, and only the flush firing on a later successful read put
          // it back. Showing nothing we cannot vouch for is worth doing when
          // there is nothing of the learner's to show; it is not worth doing
          // to work they can see they just did. Testing for evidence first
          // keeps it visible, and keeps the buffer as the backstop rather than
          // the only copy.
          if (hasLearningEvidence(currentProgress.current)) {
            unsyncedBuffer.current = {
              progress: currentProgress.current,
              timestamp: Date.now(),
            };
          } else if (hydrationAttempt.current === 0) {
            setProgress(createEmptyProgress());
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

  // KEEP THE PLACE ON THE DEVICE, for a visitor with no account.
  //
  // The three guards are the whole privacy argument, so none of them is
  // incidental:
  //
  // `!hydrated` -- writing before the read above has landed would put the empty
  // initial state over the stored record and lose exactly what this feature
  // exists to keep. This is the ordering that makes the feature work at all.
  //
  // an approved account -- the account is authoritative and already carries
  // `recentModule` through recordModuleVisit. Copying it to the device would
  // leave scores, badges and a display name in a shared browser after the
  // session expired, outside the retention classes and outside the verified
  // deletion workflow docs/learner-data-policy.md requires.
  //
  // `hasLearningEvidence` -- a visitor who reads a page and leaves gets no key
  // written at all. The key appears when they have done something worth
  // keeping, and not before.
  // `syncStatus === "local-only"` -- and this one is NOT redundant with the
  // account check, it is the one that stops this feature leaking an account
  // record onto a shared device. On SIGN OUT, `account` becomes null and this
  // effect re-runs immediately, while `progress` is still the full account
  // record -- attempts, badges, display name -- because the hydration effect
  // above only SCHEDULES its reset on a setTimeout(0). Without this guard the
  // account record would be written to localStorage at the moment of signing
  // out, and the empty progress that lands a tick later does not overwrite it,
  // because empty progress has no evidence and takes the early return. The same
  // path runs when a session renewal fails. `syncStatus` is still "synced" at
  // that render and only becomes "local-only" in the same batch that sets the
  // empty record, so keying on it makes the write follow the reset rather than
  // race it.
  useEffect(() => {
    if (!hydrated) return;
    if (syncStatus !== "local-only") return;
    if (account?.state === "approved") return;
    if (!hasLearningEvidence(progress)) return;
    const storage = deviceStorage();
    if (!storage) return;
    // A refused write (private mode, full quota) is not surfaced: the place is
    // still right in this tab, it just will not survive the reload.
    writeDeviceLocalProgress(storage, progress);
  }, [account, hydrated, progress, syncStatus]);

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
  //
  // The decision lives in planUnsyncedProgressFlush (src/progress.ts), where
  // tests/progress-unsynced-flush.test.mjs exercises it. It MERGES the buffer
  // into what the read returned; it never replaces with it. The buffer is built
  // on whatever this provider held before its first successful read -- usually
  // empty progress plus the one module the learner just finished. Applying it
  // wholesale (as 0.110.0 and 0.111.0 did) threw away the learner's hydrated
  // record and then PUT that partial record over their real one: complete seven
  // modules on seven fresh page loads and the account kept only the seventh.
  // plan.apply is a state updater, so the merge runs against the hydrated
  // record React holds; the sync effect above then writes the merged record.
  useEffect(() => {
    const plan = planUnsyncedProgressFlush({
      writable: syncStatus === "synced" && syncEnabled.current,
      flushInFlight: flushInFlight.current,
      unsynced: unsyncedBuffer.current?.progress ?? null,
      lastSynchronized: lastSynchronized.current,
    });
    if (plan.action === "wait") return;
    unsyncedBuffer.current = null;
    if (plan.action === "merge") setProgress(plan.apply);
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
    // Clear the device key too, or "reset" would leave the record it just
    // cleared on screen sitting in the browser, ready to come back on reload.
    const storage = deviceStorage();
    if (storage) clearDeviceLocalProgress(storage);
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

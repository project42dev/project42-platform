"use client";

import {
  ACCOUNT_BACKED_PROGRESS_SOURCE,
  createEmptyProgress,
  planAccountProgressHydration,
  planProgressSaveRetry,
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
 * A save the API answered and rejected, carrying the status it rejected it
 * with. The sync effect throws on `!response.ok`, so without this a 400 and a
 * dropped connection reach the same catch indistinguishable -- and the retry
 * added on 2026-09-12 would resend a body the server has already refused,
 * every 30 seconds, for as long as the tab is open.
 */
class ProgressSaveError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProgressSaveError";
    this.status = status;
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
  //
  // WHAT THE BUFFER IS AND IS NOT RESPONSIBLE FOR. It used to be the only
  // thing rescuing work done before the first read resolved, and that rescue
  // rested on an unwritten contract: the sync effect re-running because
  // `account` is in its deps, buffering because `syncEnabled` was still false,
  // and the reconnect flush draining it afterwards -- three things in an order
  // nothing declared. Since planAccountProgressHydration (v0.113.0) the merge
  // in the read handler covers that window directly and unconditionally: the
  // read cannot discard in-session evidence whatever order the effects ran in.
  // The buffer is now a BACKSTOP for the case the merge cannot reach -- a read
  // that failed outright, so there is no account record to merge into -- and
  // the effect ordering is no longer load-bearing.
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

  // SAVE RETRY. A failed PUT buffered and then waited for something that could
  // not come: the reconnect effect only fires on a `syncStatus` transition and
  // only acts on "synced", and the sync effect only re-runs when `progress`
  // changes. A learner whose save failed and who then closed the tab lost the
  // work. `saveRetry` is the re-arm -- bumped on a bounded backoff timer and
  // whenever the browser reports the network is back -- and it is in the sync
  // effect's deps so bumping it re-runs the save.
  const saveAttempt = useRef(0);
  const [saveRetry, setSaveRetry] = useState(0);
  const saveRetryTimer = useRef<number | null>(null);

  // UNLOAD FLUSH. The newest record that has not been confirmed written, kept
  // where an event handler running during unload can reach it synchronously.
  // Cleared only by a save the API accepted.
  const pendingWrite = useRef<LearnerProgress | null>(null);

  // REPLACE INTENT. An import/restore or a reset is a deliberate whole-record
  // replacement, and every merge in this provider is a union. Until the
  // replacement is confirmed written, a read of the account is stale by
  // construction and must not be merged back over it -- that is what
  // resurrected the very modules an import had removed, and what made a reset
  // silently not happen. Cleared on the save that lands.
  const pendingReplacement = useRef(false);

  // A display name typed this session and not yet confirmed written. The
  // account record's name wins on every merge, which is right for a name set on
  // an earlier visit and wrong for one set moments ago.
  const pendingDisplayName = useRef<string | null>(null);

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
        // SIGNING OUT MUST END THE SESSION'S WRITE STATE, NOT JUST ITS VIEW.
        //
        // Everything below is per-learner, and this branch is the only place
        // the provider learns that the learner is gone. Leaving any of it set
        // hands one learner's state to whoever signs in next ON THIS TAB, and
        // the account-scoped refs make that concrete rather than theoretical:
        //
        // A resets their progress, then signs out inside the 800ms debounce.
        // B signs in. B's read resolves and `pendingReplacement` is still
        // true, so the hydration updater returns B's local record -- the empty
        // one -- unchanged, and because it is the same reference React does not
        // even re-render. `lastSynchronized` becomes B's account record, the
        // empty record differs from it, and `syncEnabled` was never cleared, so
        // the debounced save writes EMPTY PROGRESS OVER B'S ACCOUNT. A's reset,
        // executed against B.
        //
        // `syncEnabled` is the pre-existing half of this and the most important
        // line here: it is the gate described above -- "no read has succeeded,
        // do not write" -- and that is true of B until B's own read succeeds.
        // Without clearing it the gate silently carries A's permission over.
        syncEnabled.current = false;
        pendingReplacement.current = false;
        pendingDisplayName.current = null;
        pendingWrite.current = null;
        unsyncedBuffer.current = null;
        lastSynchronized.current = "";
        saveAttempt.current = 0;
        hydrationAttempt.current = 0;
        if (saveRetryTimer.current !== null) {
          window.clearTimeout(saveRetryTimer.current);
          saveRetryTimer.current = null;
        }
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
          //
          // `pendingReplacement` is the one case where the merge is wrong: an
          // import or a reset is a deliberate REMOVAL, and a union undoes it.
          // `lastSynchronized` is still set to the account record, so the
          // replacement and the account differ and the sync effect writes the
          // replacement -- which is what makes the removal stick.
          lastSynchronized.current = JSON.stringify(normalized);
          setProgress(
            planAccountProgressHydration(normalized, {
              pendingReplacement: pendingReplacement.current,
              pendingDisplayName: pendingDisplayName.current,
            }),
          );
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

  // THE ONE PLACE A SAVE IS SENT.
  //
  // The debounce, the retry timer, the `online` handler and the unload flush
  // all call this, so there is a single `flushInFlight` guard and a single
  // place that clears `pendingWrite` -- rather than four spellings of a PUT
  // that have to be kept in agreement.
  //
  // `keepalive` is what makes the unload flush possible at all. An ordinary
  // fetch is cancelled when the document goes away; a keepalive one is allowed
  // to outlive it. The cost is a 64KB body cap across all in-flight keepalive
  // requests -- a learner record is a few KB even after a full course, and the
  // import path already refuses anything over 1MB, so this is not a live
  // constraint, but it is why this is not simply switched on for every save.
  // `navigator.sendBeacon` is the other candidate and is worse here: it cannot
  // send `content-type: application/json` without a preflight it has no way to
  // complete during unload, and it cannot send a PUT.
  const sendProgress = useCallback(
    (record: LearnerProgress, options: { keepalive?: boolean; signal?: AbortSignal }) =>
      apiFetch("/v1/me/progress", {
        method: "PUT",
        keepalive: options.keepalive,
        signal: options.signal,
        body: JSON.stringify({
          // A FRESH id per send, including for a retry of identical content.
          // The worker treats importId as an idempotency key and will replay a
          // repeat of the same record harmlessly -- but only if the two arrive
          // in sequence. Its stored command digest covers the send timestamp,
          // so two sends racing under one id (which is exactly what the unload
          // flush does when it overtakes an in-flight save) collide and the
          // second is refused 409. A fresh id costs an extra import row and
          // makes the save land; the record replaces rather than merges
          // server-side, so sending it twice is not a duplicate.
          importId: crypto.randomUUID(),
          // Shared with the worker's allow-list. Do not inline the literal:
          // a hardcoded copy here that the worker did not accept is what made
          // every save 400 and left production module_progress empty.
          source: ACCOUNT_BACKED_PROGRESS_SOURCE,
          progress: record,
        }),
      }),
    [apiFetch],
  );

  // UNLOAD FLUSH (items 2 and 3 of the 2026-09-12 durability review).
  //
  // The save is debounced 800ms. Answer the last question of a module and
  // close the tab, or hit reload, or follow a link off the site, and the timer
  // is destroyed with the document: the PUT was never sent and nothing said so.
  // The owner's 1500ms reproduction almost certainly landed here rather than on
  // the replace it was aimed at. A failed save is the same window with a longer
  // fuse -- the record sits in `pendingWrite` waiting for a retry that may be
  // 30 seconds out.
  //
  // `pagehide` is the reliable signal. `beforeunload` is deliberately NOT used:
  // Safari and every mobile browser may never fire it, and registering one
  // disqualifies the page from the back/forward cache, which costs every
  // learner a slower back button to serve a minority of unloads. The
  // `visibilitychange`-to-hidden pair is what actually fires on iOS when the
  // learner switches apps or locks the screen -- on that platform a tab is
  // frequently killed without any unload event at all, so hidden is the last
  // moment we are certain to get.
  const flushOnUnload = useCallback(() => {
    const record = pendingWrite.current;
    if (!record || !syncEnabled.current) return;
    // Deliberately fire-and-forget: during unload there is no one left to
    // handle a rejection, and the document is going away regardless.
    void sendProgress(record, { keepalive: true }).catch(() => {});
  }, [sendProgress]);

  useEffect(() => {
    const onPageHide = () => flushOnUnload();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushOnUnload();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushOnUnload]);

  // RECONNECT. `online` is the browser telling us the transport came back.
  // Re-arm the save immediately rather than waiting out the remaining backoff:
  // the common case is a learner who walked back into signal, and making them
  // wait another 30 seconds for a save that would now succeed is the whole
  // complaint in miniature.
  useEffect(() => {
    const onOnline = () => {
      if (!pendingWrite.current) return;
      if (saveRetryTimer.current !== null) {
        window.clearTimeout(saveRetryTimer.current);
        saveRetryTimer.current = null;
      }
      saveAttempt.current = 0;
      setSaveRetry((value) => value + 1);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

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
    if (serialized === lastSynchronized.current) {
      // Already on the account. Nothing is owed, so nothing must be flushed on
      // unload -- leaving a stale record here would re-PUT it on every tab
      // close for the rest of the session.
      pendingWrite.current = null;
      return;
    }
    // From here the record is owed to the API. Publish it where the unload
    // handler can reach it BEFORE the debounce starts, not after: the whole
    // point is to cover the 800ms in which no request exists yet.
    pendingWrite.current = progress;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSyncStatus("syncing");
      flushInFlight.current = true;
      void sendProgress(progress, { signal: controller.signal })
        .then(async (response) => {
          flushInFlight.current = false;
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            throw new ProgressSaveError(
              body.error?.message ?? "Progress could not be synchronized.",
              response.status,
            );
          }
          lastSynchronized.current = serialized;
          // Clear the in-memory buffer on successful flush
          unsyncedBuffer.current = null;
          pendingWrite.current = null;
          // The replacement is now what the account holds, so a later read is
          // no longer stale and the ordinary merge is safe again.
          pendingReplacement.current = false;
          pendingDisplayName.current = null;
          saveAttempt.current = 0;
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
          // `pendingWrite` deliberately stays set: the unload flush is the only
          // thing that can still save this record if the tab closes before the
          // retry below comes round.
          setSyncStatus("error");

          // RE-ARM. Without this the buffer waits for a state change or a
          // `syncStatus` transition that nothing is going to produce.
          saveAttempt.current += 1;
          const plan = planProgressSaveRetry({
            status: caught instanceof ProgressSaveError ? caught.status : null,
            attempt: saveAttempt.current,
          });
          if (plan.action === "give-up") {
            if (plan.reason === "not-retryable") {
              // The API refused this record and will refuse it again. Hand
              // authority back to the account: a replacement the server would
              // not take must stop suppressing the hydration merge, or the
              // learner is left looking at an import that exists only in this
              // tab, over an account that still holds the old record, with no
              // way back. This is what replaceProgress's own comment promises
              // -- "if the API rejects it, the next hydration will restore the
              // server state" -- and without this line the flag made that
              // promise false.
              pendingReplacement.current = false;
            }
            return;
          }
          saveRetryTimer.current = window.setTimeout(() => {
            saveRetryTimer.current = null;
            setSaveRetry((value) => value + 1);
          }, plan.delayMs);
        });
    }, 800);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [account, hydrated, progress, saveRetry, sendProgress]);

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
      // The buffer is a union source too, and a pending import or reset is the
      // one case where unioning it back in undoes the removal the learner asked
      // for. It is superseded either way -- see the plan's own note.
      pendingReplacement: pendingReplacement.current,
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
    const nextName = displayName.trim() || "Explorer";
    // Remembered until a save confirms it, so a hydration read landing in
    // between does not hand the learner back the name they just replaced.
    pendingDisplayName.current = nextName;
    setProgress((current) => ({
      ...current,
      displayName: nextName,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const replaceProgress = useCallback(
    (replacement: LearnerProgress) => {
      const next = structuredClone(replacement);
      if (account?.state === "approved") {
        // When account-backed, the API is authoritative. Replace locally and let
        // the sync effect push it. If the API refuses it outright -- a status no
        // retry can fix -- the intent below is released in the save's catch and
        // the next hydration merges the account record back in, so the learner
        // is not stranded looking at an import that exists only in this tab.
        //
        // An import is a REPLACEMENT, which means it can REMOVE. Every merge in
        // this provider is a union, so a read of the account landing inside the
        // 800ms debounce below used to union the pre-import record back in and
        // resurrect exactly what the learner had chosen to drop. The intent
        // flag suppresses that until the replacement has actually been written.
        pendingReplacement.current = true;
        lastSynchronized.current = "";
        setProgress(next);
        return;
      }
      // No account: just set in-memory state
      setProgress(next);
    },
    [account],
  );

  // Destroys the account's learning record. Intentional, and confirmed in
  // ProfileDashboard before it is called.
  //
  // It is a replacement by an empty record, so it carries the same hazard as
  // an import and then some: an empty record holds no evidence, so a
  // re-hydration inside the debounce took the short-circuit and adopted the
  // account record outright -- the reset simply did not happen, silently, and
  // the learner had no way to tell which record the account was left holding.
  // The same intent flag covers both.
  const reset = useCallback(() => {
    if (account?.state === "approved") {
      pendingReplacement.current = true;
      lastSynchronized.current = "";
    }
    setProgress(createEmptyProgress());
  }, [account]);

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

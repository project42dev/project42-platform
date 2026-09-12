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

/**
 * Does this record hold anything a learner would notice losing?
 *
 * Deliberately broad: a started path or a recent-module visit counts, not just
 * a graded attempt. The front end asks this before it lets a record be
 * replaced, and "the learner opened a module" is work the account should keep.
 */
export function hasLearningEvidence(progress: LearnerProgress): boolean {
  return (
    progress.startedPathIds.length > 0 ||
    progress.completedModuleIds.length > 0 ||
    progress.attempts.length > 0 ||
    (progress.capstoneSubmissions?.length ?? 0) > 0 ||
    progress.badges.length > 0 ||
    Boolean(progress.recentModule)
  );
}

/**
 * Key-order-insensitive structural comparison.
 *
 * The collision checks below ask "is this the SAME record, or a different one
 * wearing the same id?" -- a question about content, not about the order a
 * particular producer happened to write the keys in. `JSON.stringify` equality
 * answered the second question. Two byte-identical attempts that had been
 * through different code paths -- one built by `recordAssessmentAttempt`, one
 * round-tripped through `PUT /v1/me/progress` and rebuilt by the worker's
 * projection, which assembles its fields in its own order -- would compare
 * unequal, and the merge would keep BOTH: the account's copy and a duplicate
 * under the `unsynced:` prefix. The learner sees the same knowledge check
 * listed twice in their history, and every later merge carries the duplicate
 * forward.
 *
 * Latent at the time of writing -- the orders happen to agree today -- so this
 * is a correctness fix, not a bug fix, and the test that pins it constructs
 * the reordering explicitly rather than relying on any producer to differ.
 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function isSameProgressRecord(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

export function mergeLearnerProgress(
  survivor: LearnerProgress,
  source: LearnerProgress,
  options: {
    displayName: string;
    sourceRecordPrefix: string;
  },
): LearnerProgress {
  const attemptIds = new Set(survivor.attempts.map((attempt) => attempt.id));
  const sourceAttempts = source.attempts.map((attempt) => {
    if (!attemptIds.has(attempt.id)) {
      attemptIds.add(attempt.id);
      return { ...attempt };
    }
    const existing = survivor.attempts.find(
      (candidate) => candidate.id === attempt.id,
    );
    if (existing && isSameProgressRecord(existing, attempt)) {
      return null;
    }
    const id = `${options.sourceRecordPrefix}:${attempt.id}`;
    attemptIds.add(id);
    return { ...attempt, id };
  });
  const capstoneIds = new Set(
    (survivor.capstoneSubmissions ?? []).map((submission) => submission.id),
  );
  const sourceCapstones = (source.capstoneSubmissions ?? []).map((submission) => {
    if (!capstoneIds.has(submission.id)) {
      capstoneIds.add(submission.id);
      return { ...submission };
    }
    const existing = (survivor.capstoneSubmissions ?? []).find(
      (candidate) => candidate.id === submission.id,
    );
    if (existing && isSameProgressRecord(existing, submission)) {
      return null;
    }
    const id = `${options.sourceRecordPrefix}:${submission.id}`;
    capstoneIds.add(id);
    return { ...submission, id };
  });
  const badges = new Map(
    survivor.badges.map((badge) => [badge.id, { ...badge }]),
  );
  for (const badge of source.badges) {
    const existing = badges.get(badge.id);
    if (!existing) {
      badges.set(badge.id, { ...badge });
      continue;
    }
    badges.set(badge.id, {
      ...existing,
      earnedAt:
        existing.earnedAt.localeCompare(badge.earnedAt) <= 0
          ? existing.earnedAt
          : badge.earnedAt,
      evidenceModuleIds: [
        ...new Set([...existing.evidenceModuleIds, ...badge.evidenceModuleIds]),
      ],
    });
  }
  const recentCandidates = [survivor.recentModule, source.recentModule].filter(
    (candidate): candidate is RecentModule => Boolean(candidate),
  );
  const recentModule = recentCandidates.sort((left, right) =>
    right.visitedAt.localeCompare(left.visitedAt),
  )[0];
  return {
    schemaVersion: 1,
    displayName: options.displayName,
    startedPathIds: [
      ...new Set([...survivor.startedPathIds, ...source.startedPathIds]),
    ],
    completedModuleIds: [
      ...new Set([
        ...survivor.completedModuleIds,
        ...source.completedModuleIds,
      ]),
    ],
    attempts: [
      ...survivor.attempts.map((attempt) => ({ ...attempt })),
      ...sourceAttempts.filter(
        (attempt): attempt is AssessmentAttempt => Boolean(attempt),
      ),
    ].sort((left, right) => left.completedAt.localeCompare(right.completedAt)),
    capstoneSubmissions: [
      ...(survivor.capstoneSubmissions ?? []).map((submission) => ({
        ...submission,
      })),
      ...sourceCapstones.filter(
        (submission): submission is CapstoneSubmission => Boolean(submission),
      ),
    ].sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)),
    badges: [...badges.values()].sort((left, right) =>
      left.earnedAt.localeCompare(right.earnedAt),
    ),
    ...(recentModule ? { recentModule: { ...recentModule } } : {}),
    updatedAt:
      survivor.updatedAt.localeCompare(source.updatedAt) >= 0
        ? survivor.updatedAt
        : source.updatedAt,
  };
}

/**
 * What the signed-in front end does with progress it recorded while the
 * session could not yet write -- before the first successful account read,
 * or after a failed save -- once the session is writable again.
 *
 * - `wait`: not writable yet, nothing buffered, or a save is already in
 *   flight. Keep the buffer; do nothing.
 * - `discard`: the buffer is exactly the record last synchronized. Drop it.
 * - `merge`: hand `apply` to the state setter. It merges the buffer INTO the
 *   hydrated record the setter passes it; it never replaces that record.
 *
 * The plan returns an updater rather than the buffered record on purpose.
 * 0.110.0 and 0.111.0 applied the buffer wholesale, and the buffer is built on
 * whatever the provider held before its first read -- usually empty progress
 * plus the one module just finished. The learner's hydrated record was
 * discarded and that partial record was then written over the account: seven
 * modules completed on seven fresh page loads left the account holding one.
 * There is no record here to replace with, only the merge.
 */
export type UnsyncedProgressFlushPlan =
  | { action: "wait" }
  | { action: "discard" }
  | {
      action: "merge";
      apply: (hydrated: LearnerProgress) => LearnerProgress;
    };

export function planUnsyncedProgressFlush(input: {
  /** A read has succeeded and the session is currently synchronized. */
  writable: boolean;
  /** A save is in flight; its own failure path re-buffers. */
  flushInFlight: boolean;
  /** Progress recorded while the session could not write, if any. */
  unsynced: LearnerProgress | null;
  /** JSON of the record last read from or written to the account. */
  lastSynchronized: string;
  /**
   * A deliberate whole-record replacement (import/restore, or reset) is pending.
   * The buffer is superseded either way: anything captured before the
   * replacement is what the learner asked to discard, and anything captured
   * after it is already a subset of the record now in state. Merging it back in
   * is the same resurrection `planAccountProgressHydration` guards against.
   */
  pendingReplacement?: boolean;
}): UnsyncedProgressFlushPlan {
  const unsynced = input.unsynced;
  if (!input.writable || input.flushInFlight || !unsynced) {
    return { action: "wait" };
  }
  if (input.pendingReplacement) return { action: "discard" };
  if (JSON.stringify(unsynced) === input.lastSynchronized) {
    return { action: "discard" };
  }
  return {
    action: "merge",
    // mergeLearnerProgress keeps every attempt, completion and badge the
    // hydrated record holds and adds only the evidence the buffer carries. A
    // buffered attempt whose id collides with a different hydrated one is kept
    // under the "unsynced:" prefix rather than dropped.
    apply: (hydrated) =>
      mergeLearnerProgress(hydrated, unsynced, {
        displayName: hydrated.displayName,
        sourceRecordPrefix: "unsynced",
      }),
  };
}

/**
 * What the front end does after a save fails.
 *
 * Until 2026-09-12 the answer was "nothing". The sync effect's catch buffered
 * the record in memory and set `syncStatus` to "error", and then every path
 * back out was closed: the reconnect effect only runs on a `syncStatus`
 * transition and only acts when the status is "synced", and the sync effect
 * itself only re-runs when `progress` changes. A learner whose save failed --
 * a dropped connection, a Worker cold-start 502, a deploy in flight -- and who
 * then closed the tab lost the work outright. Nothing had re-armed.
 *
 * So: retry on a timer, and retry when the browser says the network came back.
 * Bounded, because an unbounded retry against a permanent failure is a loop
 * that burns the learner's battery and tells them nothing.
 *
 * The status split is the part worth testing, and the part easiest to get
 * wrong. The sync effect throws on `!response.ok`, so a 400 and a dropped
 * connection arrive at the same catch. Retrying a 400 re-sends the identical
 * body that was just rejected, forever: the payload is what the server
 * objects to, and waiting does not change it. The same goes for 401/403 (the
 * session is the problem; the hydration path handles that) and for 409
 * `progress_import_conflict` (the importId is already bound to different
 * progress -- only a new importId can clear it, which the next save mints).
 * 408 and 429 are the two 4xx that DO mean "later", and every 5xx does.
 *
 * `status: null` means the request never produced a response at all -- offline,
 * DNS, TLS, an aborted socket. That is the common case and it is retryable.
 */
export type ProgressSaveRetryPlan =
  | { action: "give-up"; reason: "not-retryable" | "attempts-exhausted" }
  | { action: "retry"; delayMs: number };

/** Attempts to make before a failing save is abandoned. */
export const PROGRESS_SAVE_MAX_ATTEMPTS = 6;

export function planProgressSaveRetry(input: {
  /** HTTP status of the failed save, or null when no response was produced. */
  status: number | null;
  /** Failures so far, including this one. 1 for the first failure. */
  attempt: number;
  maxAttempts?: number;
}): ProgressSaveRetryPlan {
  const status = input.status;
  const retryableStatus =
    status === null || status === 408 || status === 429 || status >= 500;
  if (!retryableStatus) return { action: "give-up", reason: "not-retryable" };
  const maxAttempts = input.maxAttempts ?? PROGRESS_SAVE_MAX_ATTEMPTS;
  if (input.attempt >= maxAttempts) {
    return { action: "give-up", reason: "attempts-exhausted" };
  }
  // The same shape as the hydration backoff above: 1s, 2s, 4s, 8s, 16s, then
  // 30s. Deliberately identical so a learner sitting through an outage sees one
  // rhythm rather than two interleaved ones.
  const delayMs =
    input.attempt <= 5 ? 1000 * 2 ** (input.attempt - 1) : 30000;
  return { action: "retry", delayMs };
}

/**
 * What the signed-in front end does with the account record when
 * GET /v1/me/progress resolves and the learner has already been working.
 *
 * Returns a state updater, for the same reason planUnsyncedProgressFlush does:
 * the only record that may be replaced is one holding nothing, and whether
 * that is true can only be decided against the state React actually holds at
 * the moment the setter runs -- not against a ref sampled when the response
 * arrived. Everything else is a merge.
 *
 * The merge is deliberately the SAME call the reconnect flush makes -- account
 * as survivor, the in-session record as source, collisions kept under the
 * "unsynced:" prefix -- because it is the same question: work recorded while
 * the session could not yet write is being reunited with the account. Only the
 * trigger differs (a read landing, rather than the session becoming writable).
 *
 * 2026-09-11: before this existed, the hydration handler replaced state with
 * the account record outright. A learner who answered a knowledge check while
 * a read was in flight had the attempt AND the completion discarded. On the
 * first read of a session the unsynced buffer happens to catch that; on every
 * later read -- and the provider re-reads whenever the account object changes
 * identity, which a session renewal does mid-session -- it does not, because
 * the session is writable by then and the change is sitting in a debounced
 * save that the replace cancels on its way past. Nothing buffered, nothing
 * written, no error. This is the third record-replacing defect in this area
 * (see the 0.110.0 / 0.111.0 note above): the rule is that nothing here
 * replaces a record that holds evidence, ever.
 *
 * Note the asymmetry that makes the short-circuit safe rather than merely
 * convenient: when local holds no evidence the updater returns the account
 * record ITSELF, so the caller's `lastSynchronized` (the JSON of that same
 * record) still matches and no write is provoked. When local does hold
 * evidence the merged record differs, and the sync effect writes it back --
 * which is exactly how the learner's pre-hydration work reaches the account.
 */
export function planAccountProgressHydration(
  account: LearnerProgress,
  options: {
    /**
     * A deliberate whole-record replacement -- an import/restore, or a reset --
     * has been made in this session and has not yet been confirmed written.
     *
     * Both merge paths above are UNIONS, and a union is exactly wrong for a
     * replacement. An import that deliberately drops a module, or a reset that
     * drops everything, sets `lastSynchronized` to "" and puts the new record
     * in state, and the PUT then waits out the 800ms debounce. A re-hydration
     * landing inside that window -- which a session renewal provokes at any
     * moment -- merged the account record back in and resurrected precisely
     * what the learner had just removed. Worse for a reset: an empty record
     * holds no evidence, so the short-circuit above did not even merge, it
     * adopted the account record outright and the reset silently never
     * happened. No error, no second confirm, and the learner has no way to
     * tell which of the two records the account now holds.
     *
     * While a replacement is pending, a read is stale by construction: it is a
     * picture of the account taken before the replacement reached it. The
     * replacement wins, unchanged, and the caller still records the account
     * record as `lastSynchronized` so the two differ and the save is provoked.
     */
    pendingReplacement?: boolean;
    /**
     * A display name the learner typed in this session that has not yet been
     * confirmed written, if any.
     *
     * The account record is the survivor and its `displayName` wins, which is
     * right for a name the learner set on some earlier visit and wrong for one
     * they set ninety seconds ago. A rename is also not `hasLearningEvidence`
     * -- correctly, it is not learning -- so on a fresh session the
     * short-circuit above adopted the account record outright and the new name
     * vanished from the field the learner had just typed it into, with no
     * error. It was lost on the merge path too, for the ordinary reason that
     * the survivor's name wins.
     *
     * The server does keep whatever `displayName` a save carries -- it is the
     * PUT snapshot that `GET /v1/me/progress` returns, not the account's
     * `users.display_name` -- so the rename is durable once written, and this
     * is the only thing standing between the learner and that write.
     *
     * Passing it does mean the no-evidence short-circuit stops returning the
     * account record by identity, so one write is provoked. That write is the
     * point.
     */
    pendingDisplayName?: string | null;
  } = {},
): (local: LearnerProgress) => LearnerProgress {
  const displayNameFor = (fallback: string) =>
    options.pendingDisplayName ?? fallback;
  return (local) => {
    if (options.pendingReplacement) return local;
    if (!hasLearningEvidence(local)) {
      const displayName = displayNameFor(account.displayName);
      if (displayName === account.displayName) return account;
      return { ...account, displayName };
    }
    return mergeLearnerProgress(account, local, {
      displayName: displayNameFor(account.displayName),
      sourceRecordPrefix: "unsynced",
    });
  };
}

export interface ResumeTarget {
  pathId: string;
  moduleId: string;
  /**
   * The recent module was already finished and this is the next unfinished one
   * in the same path. The affordance reads the same either way; this exists so
   * a caller can tell "carry on with what you were reading" from "you finished
   * that one, here is the next" without recomputing the rule.
   */
  advancedFromCompleted: boolean;
}

/**
 * Where "Continue" should send this learner, or null when there is nothing to
 * resume and the page's ordinary start CTA should stand alone.
 *
 * THE RULE, and why it is this one:
 *
 * 1. MOST RECENT VISIT WINS. `recentModule` is a single slot that
 *    `recordModuleVisit` overwrites on every module view, so "most recent"
 *    needs no sorting here. Where two records meet -- a device-local one and
 *    an account one -- `mergeLearnerProgress` already picks the later
 *    `visitedAt`, so recency is decided once, in the merge, and this function
 *    never sees the losing candidate. That is deliberate: a second recency
 *    comparison here could disagree with the merge and the learner would get a
 *    different answer depending on which surface they looked at.
 *
 * 2. A FINISHED MODULE RESUMES AT THE NEXT ONE, not the finished one. Sending
 *    a learner back to a module they have already passed is the single most
 *    annoying thing a resume control can do -- it reads as though the site
 *    lost the completion. `path.moduleIds` is the authored order, so the next
 *    unfinished module after it is what "where you left off" means once the
 *    module is done. If everything after it is finished but something earlier
 *    is not, we fall back to the first unfinished module in the path rather
 *    than declaring the path over; a learner who skipped ahead still has
 *    somewhere to go.
 *
 * 3. A STALE MODULE ID IS IGNORED. Content is versioned and modules do leave
 *    the catalogue. A `recentModule` naming a path or module this catalogue no
 *    longer has yields null, so the affordance disappears rather than
 *    rendering a link to a 404. The module must be in `catalog.modules` AND in
 *    its path's `moduleIds`: a module present in one but not the other is a
 *    catalogue mid-migration, and a link built from half of it is still a dead
 *    link.
 *
 * 4. A COMPLETED PATH RESUMES NOWHERE. Null, so the page falls back to its
 *    ordinary CTA and the learner is pointed at new material instead of being
 *    told to continue something with nothing left in it.
 *
 * WHAT MICROSOFT LEARN DOES (verified 2026-09-12 via the Microsoft Learn
 * documentation and support answers, not from memory):
 *
 * - Its "Continue where you left off" prompt is SIGN-IN GATED. Microsoft's own
 *   support answer is "Make sure you're signed in with your Microsoft account.
 *   This allows Microsoft Learn to track your progress and offer 'Continue
 *   where you left off' prompts", and the Learn FAQ lists "Track progress on
 *   learning activities" as a benefit of signing in. A signed-out reader on
 *   Microsoft Learn gets no progress tracking and no resume at all.
 * - What it resumes to is the LAST VISITED PAGE: the Viva Learning integration
 *   describes signed-in users continuing "from their last visited page of
 *   content", which is rule 1 above.
 * - Surfaces that group learning into Not Started / In Progress / Completed
 *   offer "resume where you left off" against the IN PROGRESS set, which is
 *   the spirit of rule 2.
 * - Rule 2's chaining is NOT something Microsoft Learn reliably does, and this
 *   is the one place we deliberately go further. A learner's complaint on
 *   Microsoft Q&A -- "whenever I finish a module, it seems I'm almost never
 *   prompted to continue with the syllabus in any kind of order ... rather
 *   than offer to continue me to the next section" -- describes exactly the
 *   dead end rule 2 exists to avoid. We chain within the authored path.
 *
 * The larger divergence is rule 0, which is not in this function: Project 42
 * remembers a SIGNED-OUT visitor's place too, which Microsoft Learn does not.
 * That is a product improvement and a privacy decision; see
 * web/app/lib/deviceLocalProgress.ts for what is written and when.
 */
export function selectResumeTarget(
  progress: LearnerProgress,
  catalog: Catalog,
): ResumeTarget | null {
  const recent = progress.recentModule;
  if (!recent) return null;

  const path = catalog.paths.find((candidate) => candidate.id === recent.pathId);
  if (!path) return null;

  const knownModuleIds = new Set(catalog.modules.map((module) => module.id));
  const position = path.moduleIds.indexOf(recent.moduleId);
  if (position === -1 || !knownModuleIds.has(recent.moduleId)) return null;

  const completed = new Set(progress.completedModuleIds);
  const resumable = (moduleId: string) =>
    knownModuleIds.has(moduleId) && !completed.has(moduleId);

  if (!completed.has(recent.moduleId)) {
    return {
      pathId: path.id,
      moduleId: recent.moduleId,
      advancedFromCompleted: false,
    };
  }

  const next =
    path.moduleIds.slice(position + 1).find(resumable) ??
    path.moduleIds.find(resumable);
  if (!next) return null;

  return { pathId: path.id, moduleId: next, advancedFromCompleted: true };
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

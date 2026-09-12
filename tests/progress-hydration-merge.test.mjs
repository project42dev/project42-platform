// The platform-level gate for the hydration overwrite found on 2026-09-11.
//
// ProgressProvider's GET /v1/me/progress success handler was a plain
// setProgress(normalized): it REPLACED whatever the session held with the
// account record. Nothing gates a learner's interaction on that read
// finishing, so a knowledge check answered while the GET was in flight had its
// attempt and its module completion thrown away when the response landed.
//
// On the session's FIRST read the unsynced buffer happens to catch that and
// the reconnect flush puts it back. On every read after it -- and the provider
// re-reads whenever the account object changes identity, which a session
// renewal does mid-session -- the session is already writable, so the change
// is sitting in a debounced save that the replace cancels on its way past:
// nothing buffered, nothing written, no error. That distinction was measured
// by planting the replace back and watching which browser test broke
// (web/tests/browser/progress-hydration-race.spec.ts), not inferred.
//
// This is the same shape as the 0.110.0 / 0.111.0 loss that
// tests/progress-unsynced-flush.test.mjs pins, with the two records the other
// way round, so the fix is the same merge and not a third bespoke path:
// planAccountProgressHydration hands the provider an updater built on
// mergeLearnerProgress, account as survivor, in-session record as source.
//
// There is no React toolchain here (see tests/web-distribution.test.mjs), so
// this file tests the decision the hydration handler makes and then pins the
// provider to it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createEmptyProgress,
  hasLearningEvidence,
  planAccountProgressHydration,
  planUnsyncedProgressFlush,
  recordAssessmentAttempt,
  recordModuleVisit,
  starterCatalog,
} from "../dist/index.js";

const passed = {
  correct: 3,
  total: 3,
  scorePercent: 100,
  passed: true,
  feedback: [],
};

// Distinct (path, module) pairs whose completion needs only a passed check.
function completableModules(count) {
  const seen = new Set();
  const pairs = [];
  for (const path of starterCatalog.paths) {
    for (const moduleId of path.moduleIds) {
      const module = starterCatalog.modules.find((item) => item.id === moduleId);
      if (!module || module.capstone || seen.has(moduleId)) continue;
      seen.add(moduleId);
      pairs.push({ pathId: path.id, moduleId });
      if (pairs.length === count) return pairs;
    }
  }
  throw new Error(`starter catalogue has fewer than ${count} completable modules`);
}

// Paths a learner can finish -- and so earn the badge for -- on knowledge
// checks alone.
function capstoneFreePaths(count) {
  const paths = starterCatalog.paths.filter((path) =>
    path.moduleIds.every(
      (moduleId) =>
        !starterCatalog.modules.find((item) => item.id === moduleId)?.capstone,
    ),
  );
  if (paths.length < count) {
    throw new Error(`starter catalogue has fewer than ${count} capstone-free paths`);
  }
  return paths.slice(0, count);
}

function modulesOf(path) {
  return path.moduleIds.map((moduleId) => ({ pathId: path.id, moduleId }));
}

function completeModule(progress, { pathId, moduleId }, index) {
  return recordAssessmentAttempt(progress, starterCatalog, {
    attemptId: `attempt-${index}`,
    pathId,
    moduleId,
    completedAt: new Date(Date.UTC(2026, 8, 11, 10, index)).toISOString(),
    result: passed,
  });
}

// The record the account API returns, as the provider normalizes it.
function accountRecord(modules) {
  let record = { ...createEmptyProgress(), displayName: "Ada" };
  for (const [index, module] of modules.entries()) {
    record = completeModule(record, module, index);
  }
  return record;
}

test("a module completed before the hydration read resolves survives it", () => {
  const [accountModule, sessionModule] = completableModules(2);
  const account = accountRecord([accountModule]);

  // The provider mounts holding createEmptyProgress(). The learner answers a
  // knowledge check and passes the module while the GET is still in flight, so
  // this is the state React holds when the response finally lands.
  const beforeRead = completeModule(createEmptyProgress(), sessionModule, 9);

  const merged = planAccountProgressHydration(account)(beforeRead);

  // The old `setProgress(normalized)` ends this test holding only the
  // account's module: the one the learner just passed is gone.
  assert.ok(
    merged.completedModuleIds.includes(sessionModule.moduleId),
    "the module completed before the read resolved must still be complete",
  );
  assert.ok(
    merged.completedModuleIds.includes(accountModule.moduleId),
    "the account's own completion must survive the merge",
  );
  assert.deepEqual(
    merged.attempts.map(({ id }) => id).sort(),
    ["attempt-0", "attempt-9"],
    "both the account's attempt and the in-session attempt must be kept",
  );
  assert.ok(
    merged.startedPathIds.includes(sessionModule.pathId),
    "the path the learner started this session must be kept",
  );
  assert.equal(
    merged.displayName,
    "Ada",
    "the account's name must survive the session record's Explorer default",
  );
  // The account record handed in is not mutated.
  assert.deepEqual(account.completedModuleIds, [accountModule.moduleId]);
});

test("a badge earned before the read resolves is not un-earned by it", () => {
  // deriveBadges runs off completedModuleIds, so a session that finishes the
  // last module of a path holds a badge the account record has never seen --
  // and a learner noticing a badge disappear is how this class of bug gets
  // reported in the first place.
  const [accountPath, sessionPath] = capstoneFreePaths(2);
  const account = accountRecord(modulesOf(accountPath));

  let beforeRead = createEmptyProgress();
  for (const [index, module] of modulesOf(sessionPath).entries()) {
    beforeRead = completeModule(beforeRead, module, 20 + index);
  }

  assert.deepEqual(
    account.badges.map(({ id }) => id),
    [accountPath.badge.id],
    "the account record must actually hold a badge for this test to mean anything",
  );
  assert.deepEqual(
    beforeRead.badges.map(({ id }) => id),
    [sessionPath.badge.id],
    "the session must actually have earned a badge for this test to mean anything",
  );

  const merged = planAccountProgressHydration(account)(beforeRead);

  assert.deepEqual(
    merged.badges.map(({ id }) => id).sort(),
    [accountPath.badge.id, sessionPath.badge.id].sort(),
    "a badge earned before the read and a badge already on the account must both survive",
  );
});

test("an in-session attempt clashing with a different account attempt is kept, not dropped", () => {
  const [accountModule, sessionModule] = completableModules(2);
  const account = accountRecord([accountModule]); // holds attempt-0

  // crypto.randomUUID makes a real collision vanishingly unlikely, but the
  // provider's fallback id is `${moduleId}-${Date.now()}` and an imported or
  // replayed record can carry anything. A collision must never silently pick a
  // winner: the account keeps its id, the session record is re-filed.
  const beforeRead = completeModule(createEmptyProgress(), sessionModule, 0);
  assert.equal(beforeRead.attempts[0].id, "attempt-0");
  assert.notDeepEqual(beforeRead.attempts[0], account.attempts[0]);

  const merged = planAccountProgressHydration(account)(beforeRead);

  assert.deepEqual(
    merged.attempts.map(({ id }) => id).sort(),
    ["attempt-0", "unsynced:attempt-0"],
    "the clashing in-session attempt must be kept under the unsynced: prefix",
  );
  assert.deepEqual(
    merged.attempts.find(({ id }) => id === "attempt-0"),
    account.attempts[0],
    "the account's attempt keeps its own id and content",
  );
  assert.equal(
    merged.attempts.find(({ id }) => id === "unsynced:attempt-0").moduleId,
    sessionModule.moduleId,
  );
  assert.ok(merged.completedModuleIds.includes(sessionModule.moduleId));
  assert.ok(merged.completedModuleIds.includes(accountModule.moduleId));
});

test("an identical attempt on both sides is not duplicated", () => {
  // A re-read after a successful write: the session record and the account
  // record hold the same attempt. Keeping both would inflate the transcript.
  const [module] = completableModules(1);
  const account = accountRecord([module]);
  const beforeRead = structuredClone(account);

  const merged = planAccountProgressHydration(account)(beforeRead);

  assert.deepEqual(merged.attempts.map(({ id }) => id), ["attempt-0"]);
  assert.deepEqual(merged.completedModuleIds, [module.moduleId]);
});

test("the read resolving first adopts the account record outright and provokes no write", () => {
  // The reverse order, which is the ordinary one: the GET resolves before the
  // learner has done anything. The updater must return the account record
  // ITSELF -- not a re-canonicalised copy of it. The provider sets
  // lastSynchronized to JSON.stringify(that record) and its sync effect skips
  // a push only while the serialized state still equals it, so a merge that
  // reordered a key or a sorted array here would PUT the account's own record
  // back to it on every single page load.
  const modules = completableModules(2);
  const account = accountRecord(modules);
  const beforeRead = createEmptyProgress();
  assert.equal(hasLearningEvidence(beforeRead), false);

  const hydrated = planAccountProgressHydration(account)(beforeRead);

  assert.equal(hydrated, account, "an empty session must adopt the account record itself");
  assert.equal(JSON.stringify(hydrated), JSON.stringify(account));

  // And work done AFTER the read still lands on the full account record.
  const [third] = completableModules(3).slice(2);
  const after = completeModule(hydrated, third, 7);
  assert.deepEqual(
    [...after.completedModuleIds].sort(),
    [...modules.map(({ moduleId }) => moduleId), third.moduleId].sort(),
  );
});

test("a module visit recorded before the read resolves is evidence and survives", () => {
  // The ungated pre-hydration path: ModuleVisitTracker records a visit on
  // every module-page mount, with no interaction at all, so this is the most
  // common way a session holds something before the read lands. recentModule
  // and startedPathIds are the learner's place in the course; losing them
  // sends them back to the start of the path.
  const [accountModule, visited] = completableModules(2);
  const account = accountRecord([accountModule]);
  const beforeRead = recordModuleVisit(createEmptyProgress(), starterCatalog, {
    pathId: visited.pathId,
    moduleId: visited.moduleId,
    visitedAt: new Date(Date.UTC(2026, 8, 11, 23, 0)).toISOString(),
  });
  assert.equal(hasLearningEvidence(beforeRead), true);

  const merged = planAccountProgressHydration(account)(beforeRead);

  assert.equal(merged.recentModule?.moduleId, visited.moduleId);
  assert.ok(merged.startedPathIds.includes(visited.pathId));
  assert.ok(merged.completedModuleIds.includes(accountModule.moduleId));
});

test("a steady-state re-hydration costs at most one idempotent write, and converges", () => {
  // The ordinary mid-session re-read: a session renewal hands the provider a
  // new account object, the read returns exactly what this session already
  // holds, and the learner has evidence -- so the short-circuit does NOT
  // apply and the merge runs. The merged record carries the same data but
  // mergeLearnerProgress's own key order, which will not match the JSON the
  // provider stored in `lastSynchronized`, so the sync effect writes once.
  //
  // Once is fine. Twice would be a loop: a write that changes the record that
  // provokes the next write. Pinned here because the provider has no other
  // brake on it.
  const [module] = completableModules(1);
  let account = accountRecord([module]);
  account = recordModuleVisit(account, starterCatalog, {
    pathId: module.pathId,
    moduleId: module.moduleId,
    visitedAt: new Date(Date.UTC(2026, 8, 11, 12, 0)).toISOString(),
  });
  assert.equal(hasLearningEvidence(account), true, "the short-circuit must not be what is under test");

  const once = planAccountProgressHydration(account)(structuredClone(account));
  const twice = planAccountProgressHydration(once)(structuredClone(once));

  assert.deepEqual(once, account, "the merge must not change the data, only its shape");
  assert.equal(
    JSON.stringify(twice),
    JSON.stringify(once),
    "a second re-hydration of the merged record must be byte-identical: one write, not a loop",
  );
});

test("the hydration merge and the reconnect flush compose without duplicating anything", () => {
  // Both now run in sequence on the retry-success path: the session buffers
  // while `hydrated && !syncEnabled`, the retried read succeeds and merges
  // here, and then syncStatus flips to "synced" and the reconnect effect
  // merges the same buffer again. The second merge must be a no-op.
  const [accountModule, sessionModule] = completableModules(2);
  const account = accountRecord([accountModule]);
  const buffered = completeModule(createEmptyProgress(), sessionModule, 9);

  const merged = planAccountProgressHydration(account)(buffered);
  const plan = planUnsyncedProgressFlush({
    writable: true,
    flushInFlight: false,
    unsynced: buffered,
    lastSynchronized: JSON.stringify(account),
  });
  assert.equal(plan.action, "merge");
  const twice = plan.apply(merged);

  assert.equal(
    JSON.stringify(twice),
    JSON.stringify(merged),
    "flushing the same buffer over the merged record must change nothing",
  );
});

test("the provider hydrates through the tested plan, never by replacing state", async () => {
  const provider = await readFile(
    new URL("../web/app/components/ProgressProvider.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    provider,
    /setProgress\(planAccountProgressHydration\(normalized\)\)/,
    "ProgressProvider must apply the hydration read with the plan's merging updater.",
  );
  // The line this replaced, and every spelling of it.
  assert.doesNotMatch(
    provider,
    /setProgress\(\s*normalized\s*\)/,
    "ProgressProvider must never replace state with the hydrated record; that discarded work done before the read resolved.",
  );
  assert.doesNotMatch(
    provider,
    /setProgress\(\s*(?:remote|body\.progress)\b/,
    "ProgressProvider must never replace state with the account record.",
  );
  // The failure branch is the same window. Blanking must come second, behind
  // the evidence test, or a first failed read loses what the success handler
  // no longer can.
  assert.match(
    provider,
    /if \(hasLearningEvidence\(currentProgress\.current\)\) \{[\s\S]{0,220}?\} else if \(hydrationAttempt\.current === 0\) \{\s*setProgress\(createEmptyProgress\(\)\);/,
    "A failed hydration read must buffer a session that holds evidence before it clears anything.",
  );
});

test("the provider declares itself hydrated before it knows the account, so no button gate can stand in for the merge", async () => {
  // A `hydrated` gate on KnowledgeCheck's submit was tried on 2026-09-11 as
  // belt and braces and measured, in the browser, to protect nothing. This is
  // why: the provider sets hydrated true the moment it sees no approved
  // account, and every page load passes through exactly that state while
  // AuthProvider is still reading /v1/auth/session. `hydrated` is therefore
  // already true throughout the window the reported bug lives in -- and it is
  // the window in which the sync effect ALSO cannot help, because it returns
  // at `!account` before it reaches the branch that buffers.
  //
  // Pinned here so that if this branch ever changes, whoever changes it sees
  // that a gate was considered, and why the merge is what the learner's work
  // actually rests on.
  const provider = await readFile(
    new URL("../web/app/components/ProgressProvider.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    provider,
    /if \(!account \|\| account\.state !== "approved"\) \{\s*setProgress\(createEmptyProgress\(\)\);\s*setHydrated\(true\);/,
    "The no-account branch must still be the one that declares hydration, or this note is stale.",
  );
  assert.match(
    provider,
    /if \(!hydrated \|\| !account \|\| account\.state !== "approved"\) \{\s*return;/,
    "The sync effect must still return before buffering when there is no account, or this note is stale.",
  );

  const component = await readFile(
    new URL("../web/app/components/KnowledgeCheck.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    component,
    /if \(!hydrated\) return;|disabled=\{!hydrated/,
    "KnowledgeCheck must not carry a `hydrated` gate: it is true throughout the window that loses work, so it reads as a safety net while being none.",
  );
});

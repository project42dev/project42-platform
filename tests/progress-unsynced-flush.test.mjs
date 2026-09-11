// The platform-level gate for the 0.110.0 / 0.111.0 progress data loss.
//
// 0.110.0 buffered progress the learner recorded before the first successful
// GET /v1/me/progress, then -- once the read succeeded -- applied that buffer
// with setProgress(buffered.progress). The buffer is built on the empty
// progress the provider holds before its first read, so the learner's hydrated
// record was replaced by "empty + the module just finished" and PUT over the
// real one. Complete seven modules on seven fresh page loads and the account
// kept one. 0.111.1 merged instead of replacing.
//
// Nothing in this repository caught it: the only thing that did was the
// downstream portal's browser journeys. There is no React toolchain here (see
// tests/web-distribution.test.mjs), so this file tests the decision the
// provider's reconnect effect makes -- planUnsyncedProgressFlush -- against
// the exact page-load sequence that lost data, and then pins the provider to
// that function so the reconnect path cannot quietly go back to applying the
// buffer itself.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createEmptyProgress,
  planUnsyncedProgressFlush,
  recordAssessmentAttempt,
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

function completeModule(progress, { pathId, moduleId }, index) {
  return recordAssessmentAttempt(progress, starterCatalog, {
    attemptId: `attempt-${index}`,
    pathId,
    moduleId,
    completedAt: new Date(Date.UTC(2026, 8, 11, 10, index)).toISOString(),
    result: passed,
  });
}

// One fresh page load, in the order the provider runs it:
//   1. the provider mounts holding createEmptyProgress();
//   2. the learner finishes a module before the first read has succeeded, so
//      the sync effect buffers "empty + this module" instead of writing;
//   3. the read succeeds and hydrates the account record;
//   4. the reconnect effect plans the flush and hands plan.apply to setProgress;
//   5. the sync effect PUTs the resulting record, which becomes the account.
function pageLoad(account, module, index) {
  const beforeFirstRead = createEmptyProgress();
  const buffered = completeModule(beforeFirstRead, module, index);

  const hydrated = structuredClone(account);
  const lastSynchronized = JSON.stringify(hydrated);

  const plan = planUnsyncedProgressFlush({
    writable: true,
    flushInFlight: false,
    unsynced: buffered,
    lastSynchronized,
  });
  assert.equal(plan.action, "merge", `page load ${index} must flush its buffer`);
  return plan.apply(hydrated);
}

test("modules completed on successive fresh page loads all survive the flush", () => {
  const modules = completableModules(7);
  let account = { ...createEmptyProgress(), displayName: "Ada" };

  for (const [index, module] of modules.entries()) {
    account = pageLoad(account, module, index);
  }

  // 0.110.0 / 0.111.0 end this loop holding only the seventh module.
  assert.deepEqual(
    [...account.completedModuleIds].sort(),
    modules.map(({ moduleId }) => moduleId).sort(),
    "every module completed on an earlier page load must still be complete",
  );
  assert.deepEqual(
    account.attempts.map(({ id }) => id),
    modules.map((_, index) => `attempt-${index}`),
  );
  assert.equal(account.displayName, "Ada", "the account's name must survive the buffer's default");
});

test("the merge keeps hydrated evidence and adds only what the buffer carries", () => {
  const [first, second, third] = completableModules(3);
  let hydrated = { ...createEmptyProgress(), displayName: "Ada" };
  hydrated = completeModule(hydrated, first, 1);
  hydrated = completeModule(hydrated, second, 2);

  // The buffer reuses attempt id "attempt-1" for a different record, which the
  // merge must keep under the unsynced: prefix rather than drop or overwrite.
  let buffered = createEmptyProgress();
  buffered = completeModule(buffered, third, 1);

  const plan = planUnsyncedProgressFlush({
    writable: true,
    flushInFlight: false,
    unsynced: buffered,
    lastSynchronized: JSON.stringify(hydrated),
  });
  assert.equal(plan.action, "merge");
  const merged = plan.apply(hydrated);

  assert.deepEqual(
    [...merged.completedModuleIds].sort(),
    [first.moduleId, second.moduleId, third.moduleId].sort(),
  );
  assert.deepEqual(
    merged.attempts.map(({ id }) => id).sort(),
    ["attempt-1", "attempt-2", "unsynced:attempt-1"],
  );
  assert.equal(merged.displayName, "Ada");
  // The hydrated record passed in is not mutated.
  assert.deepEqual(hydrated.attempts.map(({ id }) => id), ["attempt-1", "attempt-2"]);
});

test("the flush waits while the session cannot write and drops a stale buffer", () => {
  const buffered = completeModule(createEmptyProgress(), completableModules(1)[0], 0);
  const base = {
    writable: true,
    flushInFlight: false,
    unsynced: buffered,
    lastSynchronized: JSON.stringify(createEmptyProgress()),
  };

  assert.deepEqual(planUnsyncedProgressFlush({ ...base, writable: false }), { action: "wait" });
  assert.deepEqual(planUnsyncedProgressFlush({ ...base, flushInFlight: true }), { action: "wait" });
  assert.deepEqual(planUnsyncedProgressFlush({ ...base, unsynced: null }), { action: "wait" });
  assert.deepEqual(
    planUnsyncedProgressFlush({ ...base, lastSynchronized: JSON.stringify(buffered) }),
    { action: "discard" },
  );
  assert.equal(planUnsyncedProgressFlush(base).action, "merge");
});

test("the provider's reconnect path flushes through the tested plan, never the raw buffer", async () => {
  const provider = await readFile(
    new URL("../web/app/components/ProgressProvider.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    provider,
    /planUnsyncedProgressFlush\(/,
    "ProgressProvider must decide the reconnect flush with planUnsyncedProgressFlush.",
  );
  assert.match(
    provider,
    /setProgress\(plan\.apply\)/,
    "ProgressProvider must apply the flush with the plan's merging updater.",
  );
  // The 0.110.0 / 0.111.0 line was setProgress(buffered.progress).
  assert.doesNotMatch(
    provider,
    /setProgress\(\s*(?:buffered|unsyncedBuffer)\b/,
    "ProgressProvider must never apply the unsynced buffer to state directly; that replaced the learner's record.",
  );
});

// THE RESUME SELECTION RULE.
//
// The owner's complaint, in his words, was that the site should remember his
// location without anyone pressing save, the way Microsoft Learn does. The
// front end had no resume affordance anywhere: not on /, not on /learn, not on
// /learn/paths, not on /profile. ProgressSnapshot.tsx rendered the only
// "Continue <title>" control in the codebase and was imported by nothing, and
// readDeviceLocalProgress was called by nothing, so a signed-out visitor's
// place was not remembered between visits at all.
//
// Wiring a control to `progress.recentModule` directly would have been the
// obvious fix and it is wrong in two ways that a learner notices immediately:
// it sends someone who has just FINISHED a module back to the module they
// finished, and it renders a link to a 404 when the module has left the
// catalogue. selectResumeTarget is where that judgement lives, and this file is
// what makes it real. Every assertion below was checked by planting the
// corresponding defect and watching the named test fail -- see the branch
// report for the output.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createEmptyProgress,
  mergeLearnerProgress,
  recordAssessmentAttempt,
  recordModuleVisit,
  selectResumeTarget,
  starterCatalog,
} from "../dist/index.js";

const passed = {
  correct: 3,
  total: 3,
  scorePercent: 100,
  passed: true,
  feedback: [],
};

/**
 * A path whose first `count` modules can each be completed by a passing
 * knowledge check alone. A capstone module needs a submission as well, and a
 * path that ran out of plain modules would make these tests assert on the
 * capstone rule rather than the resume rule.
 */
function plainRun(count) {
  for (const path of starterCatalog.paths) {
    const plain = path.moduleIds.filter((moduleId) => {
      const module = starterCatalog.modules.find((item) => item.id === moduleId);
      return module && !module.capstone;
    });
    if (plain.length >= count) return { pathId: path.id, moduleIds: plain };
  }
  throw new Error(
    `no starter path has ${count} modules completable by knowledge check alone`,
  );
}

function visit(progress, pathId, moduleId, minute) {
  return recordModuleVisit(progress, starterCatalog, {
    pathId,
    moduleId,
    visitedAt: new Date(Date.UTC(2026, 8, 12, 10, minute)).toISOString(),
  });
}

function complete(progress, pathId, moduleId, minute) {
  return recordAssessmentAttempt(progress, starterCatalog, {
    attemptId: `attempt-${moduleId}`,
    pathId,
    moduleId,
    completedAt: new Date(Date.UTC(2026, 8, 12, 10, minute)).toISOString(),
    result: passed,
  });
}

test("a learner who has done nothing has nothing to resume", () => {
  // This is what keeps the first visit honest. The page's fixed "Begin the
  // first module" CTA is unconditional server-rendered markup; the resume card
  // renders only when this returns a target. Returning anything but null here
  // is how a first-time visitor ends up looking at an empty progress shell
  // instead of the start CTA -- which is precisely what the OLD
  // ProgressSnapshot did with its "Ready when you are / Sign in to start" state.
  assert.equal(selectResumeTarget(createEmptyProgress(), starterCatalog), null);
});

test("the most recent visit wins", () => {
  const { pathId, moduleIds } = plainRun(2);
  let progress = createEmptyProgress();
  progress = visit(progress, pathId, moduleIds[0], 0);
  progress = visit(progress, pathId, moduleIds[1], 5);

  const target = selectResumeTarget(progress, starterCatalog);
  assert.deepEqual(target, {
    pathId,
    moduleId: moduleIds[1],
    advancedFromCompleted: false,
  });
});

test("the most recent visit wins across a device-local and an account record", () => {
  // Recency across two records is decided ONCE, inside mergeLearnerProgress,
  // by comparing visitedAt -- not a second time inside selectResumeTarget.
  // This is the case the feature actually ships: a signed-out visitor reads a
  // module on their phone, signs in, and the account record (which is the merge
  // survivor and holds an OLDER visit) must not drag them backwards.
  const { pathId, moduleIds } = plainRun(2);

  const account = visit(createEmptyProgress("Owner"), pathId, moduleIds[0], 0);
  const device = visit(createEmptyProgress("Explorer"), pathId, moduleIds[1], 9);

  const merged = mergeLearnerProgress(account, device, {
    displayName: "Owner",
    sourceRecordPrefix: "unsynced",
  });

  assert.equal(
    selectResumeTarget(merged, starterCatalog).moduleId,
    moduleIds[1],
    "the later visitedAt must win even though it came from the merge SOURCE",
  );

  // And the other way round, so the test is measuring visitedAt rather than
  // which argument happened to be the survivor.
  const reversed = mergeLearnerProgress(device, account, {
    displayName: "Owner",
    sourceRecordPrefix: "unsynced",
  });
  assert.equal(
    selectResumeTarget(reversed, starterCatalog).moduleId,
    moduleIds[1],
  );
});

test("a completed module resumes at the next module in the path, not the finished one", () => {
  // The rule that stops "Continue" reading as though the site lost the
  // completion. Microsoft Learn is verifiably WORSE than this: its own Q&A
  // carries a learner complaining that finishing a module "almost never"
  // offers the next one in the syllabus. We chain within the authored order.
  const { pathId, moduleIds } = plainRun(2);
  let progress = createEmptyProgress();
  progress = visit(progress, pathId, moduleIds[0], 0);
  progress = complete(progress, pathId, moduleIds[0], 1);

  const target = selectResumeTarget(progress, starterCatalog);
  assert.notEqual(
    target.moduleId,
    moduleIds[0],
    "resuming at the module the learner just finished is the defect this rule exists to prevent",
  );
  assert.deepEqual(target, {
    pathId,
    moduleId: moduleIds[1],
    advancedFromCompleted: true,
  });
});

test("a completed module falls back to an earlier unfinished module when the rest of the path is done", () => {
  // A learner who skipped ahead still has somewhere to go: everything after the
  // recent module is finished, but something before it is not, so the path is
  // not over and we must not report it as over.
  const { pathId, moduleIds } = plainRun(3);
  let progress = createEmptyProgress();
  // Finish everything except the FIRST module, and leave the last one as the
  // most recent visit.
  for (const [index, moduleId] of moduleIds.slice(1).entries()) {
    progress = complete(progress, pathId, moduleId, index + 1);
  }
  progress = visit(progress, pathId, moduleIds[moduleIds.length - 1], 20);

  const target = selectResumeTarget(progress, starterCatalog);
  assert.equal(target.pathId, pathId);
  assert.equal(target.moduleId, moduleIds[0]);
  assert.equal(target.advancedFromCompleted, true);
});

test("a fully completed path has nothing to resume", () => {
  const { pathId, moduleIds } = plainRun(2);
  const path = starterCatalog.paths.find((candidate) => candidate.id === pathId);
  let progress = createEmptyProgress();
  // Mark every module in the path complete, capstones included, by writing the
  // id list directly: the point here is the selection rule's behaviour on a
  // finished path, not the completion rules that put it in that state.
  progress = visit(progress, pathId, moduleIds[0], 0);
  progress = { ...progress, completedModuleIds: [...path.moduleIds] };

  assert.equal(
    selectResumeTarget(progress, starterCatalog),
    null,
    "a finished path must fall back to the page's ordinary CTA, not invite the learner to continue nothing",
  );
});

test("a stale module id is ignored", () => {
  // Content is versioned and modules do leave the catalogue. A recentModule
  // naming a module this catalogue no longer has must yield null, so the
  // affordance disappears instead of rendering a link to a 404.
  const { pathId, moduleIds } = plainRun(1);
  let progress = createEmptyProgress();
  progress = visit(progress, pathId, moduleIds[0], 0);
  progress = {
    ...progress,
    recentModule: { ...progress.recentModule, moduleId: "module-that-was-retired" },
  };

  assert.equal(selectResumeTarget(progress, starterCatalog), null);
});

test("a stale path id is ignored", () => {
  const { pathId, moduleIds } = plainRun(1);
  let progress = createEmptyProgress();
  progress = visit(progress, pathId, moduleIds[0], 0);
  progress = {
    ...progress,
    recentModule: { ...progress.recentModule, pathId: "path-that-was-retired" },
  };

  assert.equal(selectResumeTarget(progress, starterCatalog), null);
});

test("a module that exists but no longer belongs to its recorded path is ignored", () => {
  // The catalogue mid-migration case: the module is still in catalog.modules,
  // but the path it was recorded against no longer lists it. A link built from
  // half a catalogue is still a dead link, so both halves are checked.
  const paths = starterCatalog.paths;
  const host = paths[0];
  const other = paths.find(
    (candidate) =>
      candidate.id !== host.id &&
      candidate.moduleIds.every((id) => !host.moduleIds.includes(id)),
  );
  assert.ok(other, "need two starter paths with disjoint modules for this case");

  let progress = createEmptyProgress();
  progress = visit(progress, host.id, host.moduleIds[0], 0);
  progress = {
    ...progress,
    // A real module id, recorded against a path that does not contain it.
    recentModule: { ...progress.recentModule, moduleId: other.moduleIds[0] },
  };

  assert.equal(selectResumeTarget(progress, starterCatalog), null);
});

test("the next module is skipped when it too is already complete", () => {
  const { pathId, moduleIds } = plainRun(3);
  let progress = createEmptyProgress();
  progress = complete(progress, pathId, moduleIds[0], 1);
  progress = complete(progress, pathId, moduleIds[1], 2);
  progress = visit(progress, pathId, moduleIds[0], 3);

  const target = selectResumeTarget(progress, starterCatalog);
  assert.equal(
    target.moduleId,
    moduleIds[2],
    "the rule must walk past finished modules rather than stopping at the first one after the recent module",
  );
});

// ---------------------------------------------------------------------------
// WHEN the device key is cleared, which is the half of the hand-off that has
// no other gate.
// ---------------------------------------------------------------------------

test("the device key is cleared only once the account read has succeeded", async () => {
  // Added 2026-09-12, during the integration of fix/progress-durability, after
  // planting the defect and finding NOTHING failed.
  //
  // resume-where-you-left-off.spec.ts pins the OUTCOME of the hand-off and says
  // so in its own comment: the pre-sign-in place reaches the account and the
  // device key is then cleared. On a successful GET -- which is the only GET
  // that spec routes -- clearing the key before the read and clearing it after
  // produce identical outcomes, so moving the clear earlier leaves all three
  // browser tests green. Moving it into the `deviceRecordSeeded` block IS
  // caught, but only because that block is skipped on a normal page load and
  // the key then never clears at all; that is a different defect.
  //
  // The ordering is what the resume work's own comment calls the sequence that
  // matters most: sign in (an OIDC redirect, so a full page load), GET
  // /v1/me/progress fails, learner reloads. The seed is gone with the old page
  // and the in-memory buffer with it, so the device key is the only surviving
  // copy of where the learner had got to -- and a clear issued before the read
  // resolved would have deleted it on behalf of a hand-off that never
  // completed. There is no browser test for that sequence, so this is the gate.
  const provider = await readFile(
    new URL("../web/app/components/ProgressProvider.tsx", import.meta.url),
    "utf8",
  );

  const seedStart = provider.indexOf("const deviceRecordSeeded");
  const readStart = provider.indexOf('setSyncStatus("checking")');
  const failureStart = provider.indexOf(".catch((caught)");
  assert.ok(
    seedStart > 0 && readStart > seedStart && failureStart > readStart,
    "the hydration effect must still be findable, or this note is stale",
  );

  const beforeTheRead = provider.slice(seedStart, readStart);
  assert.doesNotMatch(
    beforeTheRead,
    /clearDeviceLocalProgress\(/,
    "Nothing on the signed-in path may clear the device key before the account read is issued: a read that then fails would leave the learner with no copy of their place at all.",
  );

  const successHandler = provider.slice(readStart, failureStart);
  const clears = successHandler.split("clearDeviceLocalProgress(").length - 1;
  assert.equal(
    clears,
    1,
    "The read's success handler must clear the device key exactly once -- that is the hand-off completing.",
  );
  assert.ok(
    successHandler.indexOf("clearDeviceLocalProgress(") >
      successHandler.indexOf("lastSynchronized.current = JSON.stringify(normalized)"),
    "The clear must come after the account record has been adopted, not before it.",
  );

  // And the failure handler must not clear it either: a read that failed is
  // precisely when the key is the learner's only remaining copy.
  assert.doesNotMatch(
    provider.slice(failureStart),
    /clearDeviceLocalProgress\([^)]*\);[\s\S]{0,400}?setSyncStatus\("error"\)/,
    "A failed hydration read must leave the device key alone.",
  );
});

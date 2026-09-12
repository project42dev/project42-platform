import portalConfig from "../../project42.config.json" with { type: "json" };
import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyProgress,
  recordAssessmentAttempt,
  type LearnerProgress,
  type LearningModule,
} from "@project42/platform";
import { siteCatalog } from "../../lib/catalog";

// Does a knowledge check answered while GET /v1/me/progress is in flight
// survive that read landing?
//
// Until 2026-09-11 it did not, in one of these two windows. ProgressProvider's
// hydration success handler replaced state with the account record outright.
//
// The two tests below are NOT the same test twice, and the difference is the
// point -- it was established by planting the old plain replace back and
// watching which one broke:
//
//   1. Before the account is known (the first test). The plain replace does
//      discard the answer here, but the work comes back: the sync effect
//      re-runs the moment `account` arrives, sees it cannot write yet, and
//      buffers -- so the reconnect flush 0.111.1 added restores it after the
//      read lands. This test passes with or without the merge. It is kept
//      because that recovery rests on two effects firing in an order nothing
//      states out loud, and if either moves, this is what notices.
//
//   2. Mid-session, on a re-hydration (the second test). Here `syncEnabled` is
//      already true, so the answer goes down the debounced-save path instead
//      of the buffer -- and the state change that discards it also cancels the
//      pending PUT. Nothing is buffered, nothing is restored, nothing is
//      written. This is where the learner's work was actually being destroyed,
//      and this test is the one the merge has to pass.
//
// Neither window is closed by a `hydrated` gate on the button, which is why
// KnowledgeCheck does not have one (see the note there). `hydrated` turns true
// as soon as the provider sees no approved account, which every page load
// passes through while AuthProvider is still reading the session -- so it is
// already true throughout the first window, and never goes back to false for
// the second.
const apiOrigin =
  process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN ??
  (portalConfig.portal as { apiOrigin?: string }).apiOrigin;

const approvedAccount = {
  id: "test-learner",
  installationId: "test-install",
  state: "approved",
  role: "learner",
  displayName: "Test Learner",
};

function completableModules(count: number) {
  const pairs: { pathId: string; learningModule: LearningModule }[] = [];
  const seen = new Set<string>();
  for (const path of siteCatalog.paths) {
    for (const moduleId of path.moduleIds) {
      const learningModule = siteCatalog.modules.find(
        (candidate) => candidate.id === moduleId,
      );
      if (!learningModule || learningModule.capstone || seen.has(moduleId)) continue;
      if ((learningModule.knowledgeCheck?.questions.length ?? 0) === 0) continue;
      seen.add(moduleId);
      pairs.push({ pathId: path.id, learningModule });
      if (pairs.length === count) return pairs;
    }
  }
  throw new Error(`site catalogue has fewer than ${count} completable modules`);
}

const [history, journey] = completableModules(2);

// The history the account already holds when the learner sits down: a module
// completed on some earlier day. The merge has to keep this as well as the
// work done during the race -- a "fix" that simply preferred local state would
// be the 0.110.0 defect over again, in the other direction.
const accountHistory = recordAssessmentAttempt(
  { ...createEmptyProgress(), displayName: "Test Learner" },
  siteCatalog,
  {
    attemptId: "account-history-attempt",
    pathId: history.pathId,
    moduleId: history.learningModule.id,
    completedAt: new Date(Date.UTC(2026, 8, 1, 9, 0)).toISOString(),
    result: { correct: 1, total: 1, scorePercent: 100, passed: true, feedback: [] },
  },
);

function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open: () => open(), opened };
}

async function answerEveryQuestion(page: Page, learningModule: LearningModule) {
  const cards = page.locator(".question-card");
  await expect(cards).toHaveCount(learningModule.knowledgeCheck.questions.length);
  for (const [index, question] of learningModule.knowledgeCheck.questions.entries()) {
    await cards.nth(index).locator('input[type="radio"]').nth(question.answerIndex).check();
  }
}

function expectMergedWrite(writes: LearnerProgress[]) {
  return expect
    .poll(
      () =>
        writes.some(
          (write) =>
            write.completedModuleIds.includes(journey.learningModule.id) &&
            write.completedModuleIds.includes(history.learningModule.id) &&
            write.attempts.some((attempt) => attempt.id === "account-history-attempt"),
        ),
      {
        message:
          "a save carrying both the module just passed and the account's existing history must reach the API",
        timeout: 20_000,
      },
    )
    .toBe(true);
}

test("a module passed before the account is even known survives the read that follows", async ({
  page,
}) => {
  test.skip(!apiOrigin, "No account API is configured for this deployment.");

  // While /v1/auth/session is outstanding the provider holds no account, so it
  // has already declared itself hydrated and the sync effect returns at
  // `!account` without buffering. The answer is therefore held in state alone
  // when the account arrives and the progress read goes out.
  //
  // It survives the old plain replace anyway, which is worth knowing rather
  // than assuming: the sync effect lists `account` in its dependencies, so it
  // re-runs as soon as the account lands, takes the `!syncEnabled` branch and
  // buffers -- and the reconnect flush merges that buffer back after the read.
  // Two effects, in an order nothing declares. This test exists to notice if
  // that stops being true.
  const session = gate();
  const writes: LearnerProgress[] = [];

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname === "/v1/auth/session") {
      await session.opened;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account: approvedAccount }),
      });
      return;
    }
    if (pathname === "/v1/me/progress" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress: { revision: 1, progress: accountHistory } }),
      });
      return;
    }
    if (pathname === "/v1/me/progress" && request.method() === "PUT") {
      const body = request.postDataJSON() as { progress: LearnerProgress };
      writes.push(body.progress);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: writes.length + 1 }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  });

  await page.goto(`/learn/${journey.pathId}/${journey.learningModule.id}`);
  await answerEveryQuestion(page, journey.learningModule);

  const submitButton = page.getByRole("button", { name: "Check my answers" });
  await expect(
    submitButton,
    "the session read has not returned, and the app still lets the learner answer -- a `hydrated` gate would not change this, which is why the merge has to be what protects them",
  ).toBeEnabled();
  await submitButton.click();
  await expect(page.getByText("Checkpoint passed")).toBeVisible();

  // Only now does the account exist, and with it the read that used to wipe
  // the answer above.
  session.open();

  await expectMergedWrite(writes);
  expect(writes.at(-1)?.displayName).toBe("Test Learner");
});

test("a module passed while a mid-session account read is in flight is not discarded by it", async ({
  page,
}) => {
  test.skip(!apiOrigin, "No account API is configured for this deployment.");

  // The window that actually destroys work, and the one no gate on a
  // mount-time flag could reach. ProgressProvider re-runs its hydration read
  // whenever the `account` object changes identity, and AuthProvider hands it
  // a new one every time the scheduled session renewal comes back 409
  // (renewSession -> refreshAccount -> loadAccount -> setAccount). That happens
  // mid-session, with the learner working and `hydrated` long since true.
  //
  // `syncEnabled` is true by then, so the answer below is NOT buffered -- it
  // goes to the debounced save, and the replace that discards it also cancels
  // that save on its way past. With the plain replace restored, this test
  // fails: no write ever carries the module.
  const secondRead = gate();
  const secondReadIssued = gate();
  const writes: LearnerProgress[] = [];
  let sessionReads = 0;
  let progressReads = 0;

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname === "/v1/auth/session") {
      sessionReads += 1;
      // The first session arms AuthProvider's renewal timer to fire in about
      // two seconds (it renews five minutes before expiry). The second -- the
      // one refreshAccount fetches after the 409 -- expires far enough away
      // that no further renewal is scheduled, so exactly one re-hydration
      // happens and the test stays deterministic.
      const expiresInMs = sessionReads === 1 ? 5 * 60_000 + 2_000 : 24 * 60 * 60_000;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: approvedAccount,
          session: {
            expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
            absoluteExpiresAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
          },
        }),
      });
      return;
    }
    if (pathname === "/v1/auth/renew" && request.method() === "POST") {
      // 409 is the "your account record moved under you" answer, and it is
      // what makes AuthProvider re-read the account -- handing
      // ProgressProvider a new object, which re-runs its hydration read.
      await route.fulfill({
        status: 409,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: { code: "account_state_changed" } }),
      });
      return;
    }
    if (pathname === "/v1/me/progress" && request.method() === "GET") {
      progressReads += 1;
      if (progressReads >= 2) {
        // Held open, and answering DELIBERATELY stale: this is the account as
        // it was before the learner's click, which is exactly what a read
        // issued before that click returns.
        secondReadIssued.open();
        await secondRead.opened;
      }
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress: { revision: 1, progress: accountHistory } }),
      });
      return;
    }
    if (pathname === "/v1/me/progress" && request.method() === "PUT") {
      const body = request.postDataJSON() as { progress: LearnerProgress };
      writes.push(body.progress);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: writes.length + 1 }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  });

  const firstRead = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/v1/me/progress",
  );
  await page.goto(`/learn/${journey.pathId}/${journey.learningModule.id}`);
  await firstRead;
  await answerEveryQuestion(page, journey.learningModule);

  // Wait for the renewal to come back 409 and the re-hydration read to go out.
  // It is now sitting open, which is where a learner on a slow connection is
  // for seconds at a time.
  await secondReadIssued.opened;

  await page.getByRole("button", { name: "Check my answers" }).click();
  // Release at once: the save is debounced by 800ms, so the read has to land
  // inside that window for this to be the race at all. If the PUT got out
  // first the overwrite would cost the learner only their screen, not the
  // record, and the test would prove nothing.
  secondRead.open();

  await expect(page.getByText("Checkpoint passed")).toBeVisible();
  await expectMergedWrite(writes);

  // The record the held read answered with is stale in a second way: it also
  // predates the module visit this session already saved. After the merge,
  // `lastSynchronized` is that stale record -- deliberately, so the merged
  // write goes out -- and the write that follows must carry everything the
  // session had, not just the answer that raced the read.
  const merged = writes.at(-1) as LearnerProgress;
  expect(
    merged.recentModule?.moduleId,
    "the visit recorded earlier in this session must not be rolled back by a stale read",
  ).toBe(journey.learningModule.id);
  expect([...merged.startedPathIds].sort()).toEqual(
    [...new Set([history.pathId, journey.pathId])].sort(),
  );
});

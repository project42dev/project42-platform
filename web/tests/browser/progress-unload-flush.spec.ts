import portalConfig from "../../project42.config.json" with { type: "json" };
import { expect, test, type Page } from "@playwright/test";
import {
  createEmptyProgress,
  type LearnerProgress,
  type LearningModule,
} from "@project42/platform";
import { siteCatalog } from "../../lib/catalog";

// Does the learner's answer actually LEAVE THE BROWSER when they stop looking
// at the page?
//
// tests/progress-durability.test.mjs pins the decisions -- which failures are
// retryable, what the backoff is, that a replacement is not unioned away. What
// it cannot pin is that a handler registered for `pagehide` and
// `visibilitychange` really fires and really issues the save. That is measured
// here, and it was measured: removing both listeners fails the first test
// below, and removing the retry re-arm fails the second.
//
// WHAT THIS FILE DOES NOT PROVE, deliberately and with the limitation stated
// rather than papered over: that `keepalive` is what carries the request
// through a real unload. Both tests here dispatch `visibilitychange` rather
// than destroying the document, because a torn-down page cannot be asserted
// against -- and that means an ordinary fetch would have completed too.
// Planting the `keepalive` flag away leaves both of them passing. A version
// that really navigated was written and discarded: proving the difference
// needs the flushed request to ARRIVE somewhere, and Playwright's route
// interception cannot answer a request issued from a document that is being
// destroyed, so the test failed with and without the flag and measured only
// the harness. `keepalive` is therefore held by the source assertion in
// tests/progress-durability.test.mjs ("the unload flush uses a transport that
// survives the document") and by the platform's documented behaviour, not by
// an end-to-end measurement. If it is ever removed, these two tests will not
// notice.
//
// The hole being closed: the save is debounced 800ms and an ordinary fetch is
// cancelled when the document goes away. Answer the last question of a module
// and then close the tab, hit reload, or follow a link off the site, and the
// PUT was either never sent or killed in flight. Nothing told the learner. The
// owner's standing complaint -- that the site does not reliably remember what
// they did -- is this, and the 1500ms reproduction that was read as a
// hydration race almost certainly landed here instead.
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

const [journey] = completableModules(1);

const accountRecord: LearnerProgress = {
  ...createEmptyProgress(),
  displayName: "Test Learner",
};

async function answerEveryQuestion(page: Page, learningModule: LearningModule) {
  const cards = page.locator(".question-card");
  await expect(cards).toHaveCount(learningModule.knowledgeCheck.questions.length);
  for (const [index, question] of learningModule.knowledgeCheck.questions.entries()) {
    await cards.nth(index).locator('input[type="radio"]').nth(question.answerIndex).check();
  }
}

// The learner switching apps, locking the phone, or closing the tab. Dispatching
// the event rather than really destroying the page is deliberate: a torn-down
// page cannot be asserted against, and it is the HANDLER and the transport
// under test, not the browser's own unload machinery. `visibilitychange` to
// hidden is also the signal that matters most in practice -- on iOS a tab is
// routinely killed with no unload event at all, so it is the last moment the
// app is certain to get.
async function goHidden(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test("a save still in flight when the learner leaves is re-sent on a transport that outlives the page", async ({
  page,
}) => {
  test.skip(!apiOrigin, "No account API is configured for this deployment.");

  // Deliberately deterministic and free of any timing assumption: the debounced
  // PUT is held open rather than answered, so the test WAITS for the debounce
  // instead of racing it. That in-flight request is exactly what a real unload
  // destroys -- the browser cancels it with the document -- so a second,
  // keepalive send is the only thing that can still save this answer.
  //
  // Without the pagehide/visibilitychange flush there is one PUT, forever.
  const puts: LearnerProgress[] = [];
  let releaseFirstPut = () => {};
  const firstPutHeld = new Promise<void>((resolve) => {
    releaseFirstPut = resolve;
  });

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname === "/v1/auth/session") {
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
        body: JSON.stringify({ progress: { revision: 1, progress: accountRecord } }),
      });
      return;
    }
    if (pathname === "/v1/me/progress" && request.method() === "PUT") {
      const body = request.postDataJSON() as { progress: LearnerProgress };
      puts.push(body.progress);
      // Hold the first one open, the way a slow network does. Every later one
      // is answered normally.
      if (puts.length === 1) await firstPutHeld;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress: { revision: puts.length + 1, progress: body.progress } }),
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
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(page.getByText("Checkpoint passed")).toBeVisible();

  // The debounce has fired and the save is in flight, unanswered.
  await expect
    .poll(() => puts.length, { message: "the debounced save must reach the API" })
    .toBe(1);
  expect(
    puts[0].completedModuleIds,
    "the debounced save must carry the module just passed",
  ).toContain(journey.learningModule.id);

  await goHidden(page);

  await expect
    .poll(() => puts.length, {
      message:
        "leaving the page must re-send the unconfirmed record on a transport that survives unload; without the flush the in-flight request is simply destroyed",
      timeout: 10_000,
    })
    .toBeGreaterThan(1);
  expect(puts.at(-1)?.completedModuleIds).toContain(journey.learningModule.id);

  releaseFirstPut();
});

test("a save that failed is retried on its own, with no further interaction", async ({
  page,
}) => {
  test.skip(!apiOrigin, "No account API is configured for this deployment.");

  // Item 3. A failed PUT buffered the record and set syncStatus to "error", and
  // then every route back out was closed: the reconnect effect fires only on a
  // syncStatus transition and acts only on "synced", and the sync effect re-runs
  // only when `progress` changes. The learner had done the work and would do
  // nothing further, so nothing ever re-armed and the record died with the tab.
  //
  // The learner touches nothing after the failure here. Only the retry can make
  // the write land.
  const accepted: LearnerProgress[] = [];
  let attempts = 0;

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname === "/v1/auth/session") {
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
        body: JSON.stringify({ progress: { revision: 1, progress: accountRecord } }),
      });
      return;
    }
    if (pathname === "/v1/me/progress" && request.method() === "PUT") {
      attempts += 1;
      // The first save is lost to the network -- no response at all, which is
      // what a dropped connection or a Worker cold start looks like from here.
      if (attempts === 1) {
        await route.abort("connectionfailed");
        return;
      }
      const body = request.postDataJSON() as { progress: LearnerProgress };
      accepted.push(body.progress);
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress: { revision: accepted.length + 1, progress: body.progress } }),
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
  await page.getByRole("button", { name: "Check my answers" }).click();
  await expect(page.getByText("Checkpoint passed")).toBeVisible();

  await expect
    .poll(() => attempts, { message: "the first save must be attempted and fail" })
    .toBeGreaterThanOrEqual(1);

  await expect
    .poll(
      () =>
        accepted.some((record) =>
          record.completedModuleIds.includes(journey.learningModule.id),
        ),
      {
        message:
          "a failed save must be retried without the learner doing anything further; the first backoff step is 1s",
        timeout: 15_000,
      },
    )
    .toBe(true);
});

// RESUME WHERE YOU LEFT OFF -- the signed-out journey.
//
// The owner's complaint was that the site should remember his location without
// anyone pressing save, the way Microsoft Learn does. This is the end-to-end
// proof that it now does, and it runs SIGNED OUT on purpose: it needs no
// credentials, and the signed-out case is the one that was completely broken
// before (ProgressProvider hydrated from empty and read no storage at all, so a
// visitor's place survived exactly as long as the tab did).
//
// It is also the only test in the suite that can catch a break in the WRITE
// half of the feature. The platform unit tests in tests/progress-resume.test.mjs
// pin the selection rule against a record handed to them; nothing there would
// notice if the record never reached localStorage in the first place.
//
// NOTE ON MICROSOFT LEARN: its own "Continue where you left off" is sign-in
// gated -- Microsoft's support answer is "Make sure you're signed in with your
// Microsoft account. This allows Microsoft Learn to track your progress and
// offer 'Continue where you left off' prompts". This test proves Project 42
// does it for a signed-out reader too, which is further than the thing the
// owner asked us to match.
import portalConfig from "../../project42.config.json" with { type: "json" };
import { expect, test, type Page } from "@playwright/test";
import { siteCatalog } from "../../lib/catalog";

const apiOrigin =
  process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN ??
  (portalConfig.portal as { apiOrigin?: string }).apiOrigin;

const DEVICE_KEY = "project42.progress.v1";

const PATH_ID = "ai-foundations";
// Deliberately NOT the first module in the path. /learn ships a fixed "Begin
// the first module" CTA pointing at /learn/ai-foundations/what-ai-does, so a
// resume control that silently fell back to that hardcoded module would pass a
// test written against the first module while proving nothing at all.
const MODULE_ID = "language-models-and-generation";

const moduleTitle = (() => {
  const module = siteCatalog.modules.find((entry) => entry.id === MODULE_ID);
  if (!module) {
    throw new Error(
      `This site's catalogue has no module "${MODULE_ID}". Pick one it has, ` +
        "rather than asserting on a title no page will ever render.",
    );
  }
  return module.title;
})();

/**
 * Signed out, deterministically. `portal.apiOrigin` is configured, so
 * AuthProvider calls GET /v1/auth/session on every load; left unrouted the
 * result would depend on whether a real account service answered, which is
 * exactly the flake this suite does not need. A 401 is the signed-out answer
 * AuthProvider already handles: it clears the account and leaves the visitor
 * anonymous.
 */
async function staySignedOut(page: Page) {
  if (!apiOrigin) return;
  await page.route(`${apiOrigin}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      status: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: { message: "Not signed in." } }),
    });
  });
}

const continueLink = (page: Page) =>
  page.getByRole("link", { name: new RegExp(`Continue:\\s*${moduleTitle}`, "i") });

test.describe("resume where you left off", () => {
  test("a signed-out visitor is offered their module back by name, and it takes them there", async ({
    page,
  }) => {
    await staySignedOut(page);

    // 1. Read a module. Nobody presses save.
    await page.goto(`/learn/${PATH_ID}/${MODULE_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: moduleTitle }),
    ).toBeVisible();

    // 2. The visit must reach the device before we navigate, or the rest of
    //    this test would be racing ModuleVisitTracker rather than measuring it.
    //    This is also the assertion that fails first and most clearly when the
    //    device-local WRITE is broken, which is what makes the planted
    //    regression on writeDeviceLocalProgress land here.
    const storedModuleId = await page.waitForFunction(
      (key) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
          recentModule?: { moduleId?: string };
        };
        return parsed.recentModule?.moduleId ?? null;
      },
      DEVICE_KEY,
    );
    expect(await storedModuleId.jsonValue()).toBe(MODULE_ID);

    // 3. Navigate away, then RELOAD so nothing survives in memory. Same browser
    //    context, so the same localStorage -- this is the "came back later"
    //    case, not a soft client-side route change.
    await page.goto("/learn");
    await page.reload();

    // 4. The affordance names the module and is reachable without scrolling
    //    past the page's own start CTA.
    await expect(continueLink(page)).toBeVisible();

    // 5. The home page too -- the owner's primary surface.
    await page.goto("/");
    await expect(continueLink(page)).toBeVisible();

    // 6. And it actually returns them to the module.
    await continueLink(page).click();
    await expect(page).toHaveURL(new RegExp(`/learn/${PATH_ID}/${MODULE_ID}/?$`));
    await expect(
      page.getByRole("heading", { level: 1, name: moduleTitle }),
    ).toBeVisible();
  });

  test("a first-time visitor gets the start CTA and no empty resume shell", async ({
    page,
  }) => {
    // Item 3 of the brief, proven in a browser rather than argued. The old
    // ProgressSnapshot rendered a "Ready when you are / Sign in to start" card
    // in this state; a resume control that renders an empty shell to someone
    // with nothing to resume is worse than no resume control, because it takes
    // the space the real start CTA needs.
    //
    // A fresh context means empty storage, so this needs no clearing step and
    // cannot be polluted by the test above.
    await staySignedOut(page);
    await page.goto("/learn");

    // The fixed CTA is untouched, unconditional, server-rendered.
    await expect(
      page.getByRole("link", { name: "Begin the first module" }),
    ).toBeVisible();

    // And nothing offers to continue anything.
    await expect(page.getByText(/^Continue:/)).toHaveCount(0);

    await page.goto("/");
    await expect(page.getByText(/^Continue:/)).toHaveCount(0);
  });
});

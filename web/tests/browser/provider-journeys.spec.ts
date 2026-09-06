import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  buildTranscriptCsv,
  createEmptyProgress,
  starterCatalog,
  type LearnerProgress,
  type LearningModule,
} from "@project42/platform";
import { readFile } from "node:fs/promises";

const apiOrigin = process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN;

async function installJourneyApi(page: Page) {
  if (!apiOrigin) return;
  let serverProgress = createEmptyProgress("Test Learner");
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/v1/auth/session") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account: {
            id: "test-learner",
            installationId: "test-install",
            state: "approved",
            role: "learner",
            displayName: "Test Learner",
          },
        }),
      });
      return;
    }
    if (pathname === "/v1/me/progress" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          progress: { revision: 1, progress: serverProgress },
        }),
      });
      return;
    }
    if (pathname === "/v1/me/progress" && request.method() === "PUT") {
      const body = request.postDataJSON() as { progress: LearnerProgress };
      serverProgress = body.progress;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ revision: 1 }),
      });
      return;
    }
    if (pathname === "/v1/me/transcript.csv") {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="project42-transcript.csv"',
        },
        body:
          '"schema_version","record_authority","record_type"\r\n' +
          buildTranscriptCsv(starterCatalog, serverProgress),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  });
}

const providerPathIds = [
  "anthropic-claude-practice",
  "openai-practice",
  "google-gemini-practice",
] as const;

const openAIPath = starterCatalog.paths.find(
  (candidate) => candidate.id === "openai-practice",
);
const comparisonPath = starterCatalog.paths.find(
  (candidate) => candidate.id === "providers-in-practice",
);

if (!openAIPath) throw new Error("OpenAI practice path is missing");
if (!comparisonPath) throw new Error("Provider comparison path is missing");

const openAIModules = openAIPath.moduleIds.map((moduleId) => {
  const learningModule = starterCatalog.modules.find(
    (candidate) => candidate.id === moduleId,
  );
  if (!learningModule) throw new Error(`Missing module ${moduleId}`);
  return learningModule;
});

async function answerCorrectly(page: Page, learningModule: LearningModule) {
  const cards = page.locator(".question-card");
  await expect(cards).toHaveCount(
    learningModule.knowledgeCheck.questions.length,
  );
  for (const [index, question] of learningModule.knowledgeCheck.questions.entries()) {
    await cards
      .nth(index)
      .locator('input[type="radio"]')
      .nth(question.answerIndex)
      .check();
  }
  const progressWrite = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/v1/me/progress",
  );
  await page.getByRole("button", { name: "Check my answers" }).click();
  await progressWrite;
  await expect(page.getByText("Checkpoint passed")).toBeVisible();
}

async function expectNoAutomatedAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("renders provider routes and completes an accessible OpenAI journey", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await installJourneyApi(page);

  for (const pathId of providerPathIds) {
    const path = starterCatalog.paths.find((candidate) => candidate.id === pathId);
    if (!path) throw new Error(`Missing provider path ${pathId}`);
    expect(path.moduleIds.length).toBeGreaterThanOrEqual(7);
    await page.goto(`/learn/${path.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: path.title }),
    ).toBeVisible();
    await expect(page.locator(".module-list li")).toHaveCount(path.moduleIds.length);
    await expectNoAutomatedAccessibilityViolations(page);
  }

  const comparisonModule = starterCatalog.modules.find(
    (candidate) => candidate.id === "compare-provider-capabilities",
  );
  if (!comparisonModule?.comparisonMatrix) {
    throw new Error("Provider comparison matrix is missing");
  }
  await page.goto(
    `/learn/${comparisonPath.id}/${comparisonModule.id}`,
  );
  const comparisonTable = page.getByRole("table", {
    name: /Anthropic, OpenAI, and Google developer-surface comparison/,
  });
  await expect(comparisonTable).toBeVisible();
  await expect(comparisonTable.getByRole("row")).toHaveCount(
    comparisonModule.comparisonMatrix.dimensions.length + 1,
  );
  for (const status of [
    "Documented",
    "Changing",
    "Non-equivalent",
    "Unknown",
  ]) {
    await expect(
      page
        .getByRole("list", { name: "Comparison status legend" })
        .getByText(status, { exact: true }),
    ).toBeVisible();
  }

  const scrollRegion = page.locator(".comparison-table-wrap");
  await expect(scrollRegion).toBeVisible();
  expect(
    await scrollRegion.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  await scrollRegion.focus();
  await expect(scrollRegion).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => scrollRegion.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expectNoAutomatedAccessibilityViolations(page);

  for (const moduleId of [
    "plan-cross-provider-migration",
    "execute-cross-provider-cutover",
  ]) {
    await page.goto(`/learn/${comparisonPath.id}/${moduleId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Practice activity", { exact: true })).toBeVisible();
    await expect(page.getByText("Knowledge check", { exact: true })).toBeVisible();
    const codeRegions = page.locator(".code-example pre");
    if ((await codeRegions.count()) > 0) {
      const codeRegion = codeRegions.first();
      await expect(codeRegion).toHaveAttribute("tabindex", "0");
      await expect(codeRegion).toHaveAttribute("aria-label", /code example$/);
      await codeRegion.focus();
      await expect(codeRegion).toBeFocused();
    }
    await expectNoAutomatedAccessibilityViolations(page);
  }

  // Hosted progress writes and authoritative exports require a configured API.
  // Public provider routes and accessibility remain covered without one.
  if (!apiOrigin) return;

  const firstModule = openAIModules[0];
  await page.goto(`/learn/${openAIPath.id}/${firstModule.id}`);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const firstChoice = page
    .locator(".question-card")
    .first()
    .locator('input[type="radio"]')
    .first();
  await firstChoice.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page
      .locator(".question-card")
      .first()
      .locator('input[type="radio"]:checked'),
  ).toHaveCount(1);

  for (const learningModule of openAIModules) {
    await page.goto(`/learn/${openAIPath.id}/${learningModule.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      learningModule.title,
    );
    await answerCorrectly(page, learningModule);
  }

  await page.goto(`/learn/${openAIPath.id}`);
  await expect(page.locator(".module-list .module-complete")).toHaveCount(
    openAIModules.length,
  );

  await page.goto("/profile");
  await expect(
    page.getByText(`${openAIModules.length} of ${openAIModules.length} modules`),
  ).toBeVisible();
  await expect(
    page.locator(".profile-stats div").filter({ hasText: "Knowledge checks" }),
  ).toContainText(String(openAIModules.length));
  await expect(
    page.locator(".badge-grid article").getByRole("heading", {
      name: "OpenAI Practitioner",
    }),
  ).toBeVisible();
  await expectNoAutomatedAccessibilityViolations(page);

  const jsonDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON record" })
    .click();
  const jsonDownload = await jsonDownloadPromise;
  const jsonPath = await jsonDownload.path();
  if (!jsonPath) throw new Error("JSON download path is unavailable");
  const record = JSON.parse(await readFile(jsonPath, "utf8"));
  expect(record.catalogVersion).toBe(starterCatalog.contentVersion);
  expect(record.learner.completedModuleIds).toHaveLength(openAIModules.length);
  expect(record.learner.attempts).toHaveLength(openAIModules.length);
  expect(record.learner.badges.map((badge: { id: string }) => badge.id)).toContain(
    "badge-openai-practitioner",
  );

  const csvDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download authoritative account CSV transcript" })
    .click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await csvDownload.path();
  if (!csvPath) throw new Error("CSV download path is unavailable");
  const csv = await readFile(csvPath, "utf8");
  expect(csv).toContain("OpenAI in Practice");
  expect(csv).toContain(openAIModules.at(-1)?.title);
});

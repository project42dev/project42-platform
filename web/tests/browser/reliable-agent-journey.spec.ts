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

const path = starterCatalog.paths.find(
  (candidate) => candidate.id === "reliable-agent-workflows",
);

if (!path) throw new Error("Reliable Agent Workflows path is missing");

const modules = path.moduleIds.map((moduleId) => {
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
    (response) => {
      const request = response.request();
      if (
        request.method() !== "PUT" ||
        new URL(response.url()).pathname !== "/v1/me/progress"
      ) {
        return false;
      }
      const body = request.postDataJSON() as { progress?: LearnerProgress };
      return body.progress?.completedModuleIds.includes(learningModule.id) ?? false;
    },
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

test("completes, revises, badges, and exports the reliable-agent journey", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(!apiOrigin, "The API-backed learner journey requires account-API configuration.");
  await installJourneyApi(page);
  expect(modules).toHaveLength(12);
  const capstoneModule = modules.at(-1);
  if (!capstoneModule?.capstone) {
    throw new Error("Reliable-agent capstone contract is missing");
  }

  await page.goto(`/learn/${path.id}`);
  await expect(page.locator(".module-list li")).toHaveCount(12);
  await expect(
    page.getByRole("heading", { level: 1, name: path.title }),
  ).toBeVisible();

  for (const [index, learningModule] of modules.slice(0, -1).entries()) {
    await page.goto(`/learn/${path.id}/${learningModule.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      learningModule.title,
    );
    if (index > 0) {
      await expect(
        page.getByRole("heading", { name: "Build on the earlier lesson" }),
      ).toBeVisible();
    }
    await answerCorrectly(page, learningModule);
  }

  await page.goto(`/learn/${path.id}/${capstoneModule.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    capstoneModule.title,
  );
  await expect(
    page.getByText("Complete exemplar: bounded support-triage agent", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Flawed exemplar: autonomous support agent", {
      exact: true,
    }),
  ).toBeVisible();

  const completeExemplar = page.locator(".capstone-exemplar").first();
  const completeSummary = completeExemplar.locator("summary");
  await completeSummary.focus();
  await page.keyboard.press("Enter");
  await expect(completeExemplar).toHaveAttribute("open", "");
  await expectNoAutomatedAccessibilityViolations(page);

  const artifactInputs = page.locator(".capstone-artifacts input");
  await expect(artifactInputs).toHaveCount(
    capstoneModule.capstone.requiredArtifacts.length,
  );
  for (const [index, artifact] of capstoneModule.capstone.requiredArtifacts.entries()) {
    await artifactInputs
      .nth(index)
      .fill(`portfolio/reliable-agent/${artifact}`);
  }

  const scoreInputs = page.locator(
    '.capstone-rubric input[type="number"]',
  );
  await expect(scoreInputs).toHaveCount(
    capstoneModule.capstone.rubric.criteria.length,
  );
  const evidenceMaps = page.locator(".criterion-evidence-map");
  await expect(evidenceMaps).toHaveCount(
    capstoneModule.capstone.rubric.criteria.length,
  );
  for (const [index] of capstoneModule.capstone.rubric.criteria.entries()) {
    await scoreInputs.nth(index).fill("0");
    await evidenceMaps
      .nth(index)
      .locator('input[type="checkbox"]')
      .nth(index)
      .check();
  }
  await page
    .getByLabel("Reflection and handoff")
    .fill(
      "Failure testing exposed blind retry. The revision adds reconciliation, idempotency, and an owned escalation path.",
    );

  await page
    .getByRole("button", { name: "Score and save capstone evidence" })
    .click();
  await expect(
    page.getByText("Latest capstone: 0% · revise and resubmit"),
  ).toBeVisible();
  await expectNoAutomatedAccessibilityViolations(page);

  for (const [index, criterion] of capstoneModule.capstone.rubric.criteria.entries()) {
    await scoreInputs.nth(index).fill(String(criterion.maxPoints));
  }
  await page
    .getByRole("button", { name: "Score and save capstone evidence" })
    .click();
  await expect(
    page.getByText("Latest capstone: 100% · rubric passed"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Your evidence passed. Complete the knowledge check below to finish the module.",
    ),
  ).toBeVisible();

  await answerCorrectly(page, capstoneModule);
  await expect(page.getByText(/Saved to your transcript/)).toBeVisible();

  await page.goto(`/learn/${path.id}`);
  await expect(page.locator(".module-list .module-complete")).toHaveCount(12);

  await page.goto("/profile");
  await expect(page.getByText("12 of 12 modules")).toBeVisible();
  await expect(
    page.locator(".profile-stats div").filter({ hasText: "Knowledge checks" }),
  ).toContainText("12");
  await expect(
    page.locator(".profile-stats div").filter({ hasText: "Capstone submissions" }),
  ).toContainText("2");
  await expect(
    page.locator(".badge-grid article").getByRole("heading", {
      name: "Reliable Agent Operator",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Reliable Agent Operating Package" }),
  ).toHaveCount(2);
  await expectNoAutomatedAccessibilityViolations(page);

  const jsonDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download JSON record" })
    .click();
  const jsonDownload = await jsonDownloadPromise;
  const jsonPath = await jsonDownload.path();
  if (!jsonPath) throw new Error("JSON download path is unavailable");
  const record = JSON.parse(await readFile(jsonPath, "utf8"));
  expect(record.learner.completedModuleIds).toHaveLength(12);
  expect(record.learner.capstoneSubmissions).toHaveLength(2);
  expect(
    record.learner.capstoneSubmissions[1].criterionScores.every(
      (score: { evidenceRefs?: string[] }) => score.evidenceRefs?.length,
    ),
  ).toBe(true);
  expect(record.learner.badges.map((badge: { id: string }) => badge.id)).toContain(
    "badge-reliable-agent-workflows",
  );

  const csvDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download authoritative account CSV transcript" })
    .click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await csvDownload.path();
  if (!csvPath) throw new Error("CSV download path is unavailable");
  const csv = await readFile(csvPath, "utf8");
  expect(csv).toContain("Reliable Agent Capstone: Design, Test, and Operate");
  expect(csv).toContain("Criterion evidence");
  expect(csv).toContain(
    "portfolio/reliable-agent/architecture-and-state-model.md",
  );
});

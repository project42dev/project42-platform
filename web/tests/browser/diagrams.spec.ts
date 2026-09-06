import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import diagramConfig from "../../node_modules/@project42/platform/content/diagrams/catalogue.json" with { type: "json" };

test("discovers and reads accessible source-first visual guides", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Visual guides", exact: true }).first().click();
  await expect(page).toHaveURL(/\/diagrams\/?$/);
  await expect(
    page.getByRole("heading", { name: "See the system, not just the steps." }),
  ).toBeVisible();
  await expect(page.locator(".diagram-card")).toHaveCount(diagramConfig.diagrams.length);

  await page
    .getByRole("link", { name: "Explore this visual" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "The learning evidence loop" }),
  ).toBeVisible();
  const diagram = page.locator(".diagram-canvas img");
  await expect(diagram).toBeVisible();
  await expect(diagram).toHaveAttribute("alt", /flow starts at Learn/i);
  await expect(page.locator(".diagram-figure")).toContainText(
    "Project 42 turns study into evidence",
  );
  await expect(page.getByRole("heading", { name: "Key takeaways" })).toBeVisible();

  const viewerTrigger = page.getByRole("button", {
    name: /open full-screen viewer/i,
  });
  await viewerTrigger.click();
  const viewer = page.getByRole("dialog", { name: "The learning evidence loop" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Close fullscreen viewer" })).toBeFocused();
  await expect(viewer.getByRole("button", { name: /Reset zoom to 100% \(currently 100%\)/ })).toBeVisible();
  for (let index = 0; index < 12; index += 1) {
    await viewer.getByRole("button", { name: "Zoom in" }).click();
  }
  await expect(viewer.getByRole("button", { name: /Reset zoom to 100% \(currently 400%\)/ })).toBeVisible();
  await expect(viewer.locator(".diagram-svg-container")).toBeVisible();
  const canScroll = await viewer.locator(".diagram-svg-container").evaluate(
    (element) =>
      element.scrollWidth > element.clientWidth ||
      element.scrollHeight > element.clientHeight,
  );
  expect(canScroll).toBe(true);

  const dialogAccessibility = await new AxeBuilder({ page })
    .include(".diagram-fullscreen-overlay")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(dialogAccessibility.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(viewerTrigger).toBeFocused();

  const [svg, source] = await Promise.all([
    request.get("/diagrams/learning-evidence-loop.svg"),
    request.get("/diagrams/learning-evidence-loop.mmd"),
  ]);
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  expect((await svg.text())).toContain("project42:source-sha256=");
  expect(source.status()).toBe(200);
  expect(await source.text()).toContain("accTitle: The learning evidence loop");

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("keeps diagram pages readable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/diagrams/safe-agent-loop");
  await expect(page.getByRole("heading", { name: "The bounded agent loop" })).toBeVisible();
  await expect(page.locator(".diagram-canvas")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

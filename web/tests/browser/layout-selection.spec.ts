import { expect, test } from "@playwright/test";

test("layout selection preserves content and loads its own bundle across reload", async ({ page }) => {
  await page.goto("/learn");
  const content = await page.locator("main").innerText();
  const theme = await page.locator("html").getAttribute("data-theme");
  for (const id of ["enterprise", "compact", "wide", "standard"]) {
    await page.getByRole("button", { name: /Account and profile|Your account/ }).click();
    await page.getByLabel("Layout", { exact: true }).selectOption(id);
    await expect(page.locator("html")).toHaveAttribute("data-layout", id);
    await expect(page.locator(`link[rel="stylesheet"][href="/layouts/${id}/layout.css"]`)).toHaveCount(1);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-layout", id);
    await expect(page.locator(`link[rel="stylesheet"][href="/layouts/${id}/layout.css"]`)).toHaveCount(1);
    expect(await page.locator("main").innerText()).toBe(content);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme!);
  }
});

test("Enterprise uses desktop navigation rail and preserves mobile navigation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("project42.layout.v1", "enterprise"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/learn");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(nav).toHaveCSS("position", "fixed");
  expect((await nav.boundingBox())!.width).toBe(224);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".nav-toggle")).toBeVisible();
  await page.locator(".nav-toggle").click();
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Learn", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("invalid stored layout falls back without changing the theme", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("project42.layout.v1", "../../invalid"));
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-layout", "../../invalid");
  await expect(page.locator("link[data-project42-layout]")).not.toHaveAttribute("href", /invalid/);
});

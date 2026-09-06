import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("keeps legal, privacy, and account expectations visible without dark patterns", async ({
  page,
}) => {
  await page.goto("/account");

  await expect(
    page.getByRole("link", { name: "Learner data and controls" }),
  ).toHaveAttribute("href", "/learner-data");
  await expect(
    page.getByRole("link", { name: "Legal & Transparency" }).first(),
  ).toHaveAttribute(
    "href",
    "/legal-transparency",
  );
  await expect(page.locator('input[type="checkbox"]:checked')).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("keeps account policy links readable at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await expect(
    page.getByRole("link", { name: "Learner data and controls" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Legal & Transparency" }).first(),
  ).toBeVisible();
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const excess = root.scrollWidth - root.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.right > root.clientWidth + 1 || bounds.left < -1;
      })
      .slice(0, 10)
      .map((element) => ({
        className: element.className,
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        tagName: element.tagName,
      }));

    return { excess, offenders };
  });
  expect(overflow.excess, JSON.stringify(overflow.offenders)).toBeLessThanOrEqual(1);
});

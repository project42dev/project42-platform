import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import portalConfig from "../../project42.config.json" with { type: "json" };

// The brand assets a page publishes come from the SELECTED theme bundle and
// the configured organisation. Naming one theme id and one organisation here
// pinned the whole portal to them: changing the theme field in
// project42.config.json failed this required gate and could not deploy.
const selectedTheme: string = portalConfig.theme;
const selectedLayout: string = portalConfig.layout.defaultPreset;
const organizationName: string = portalConfig.organization.name;

const themeManifest = JSON.parse(
  readFileSync(resolve(`public/themes/${selectedTheme}/theme.json`), "utf8"),
) as { tokens?: Record<string, string> };
const themeBackground = themeManifest.tokens?.["--p42-bg"];
const brandMarkPath: string =
  (portalConfig as { branding?: { mark?: string } }).branding?.mark ??
  "/brand/project-42-mark.svg";
const themeMarkSource = readFileSync(
  resolve(`public/themes/${selectedTheme}/mark.svg`),
  "utf8",
);

test("publishes visible accessible branding and complete icon assets", async ({
  page,
  request,
}) => {
  await page.goto("/");

  const homeBrand = page.getByRole("link", { name: `${organizationName} home` });
  await expect(homeBrand).toBeVisible();
  await expect(homeBrand.locator("svg.brand-mark")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.locator("svg.brand-mark")).toHaveCount(2);
  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveAttribute("href", `/themes/${selectedTheme}/mark.svg`);
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute(
    "href",
    `/themes/${selectedTheme}/mark.svg`,
  );
  await expect(page.locator("link[data-project42-theme-tokens]")).toHaveAttribute(
    "href",
    `/themes/${selectedTheme}/tokens.css`,
  );
  await expect(page.locator("link[data-project42-theme-components]")).toHaveAttribute(
    "href",
    `/themes/${selectedTheme}/portal.css`,
  );
  await expect(page.locator("link[data-project42-layout]")).toHaveAttribute(
    "href",
    `/layouts/${selectedLayout}/layout.css`,
  );

  // The brand mark is this deployment's own file, named by branding.mark in
  // project42.config.json. Naming it here made the gate depend on one
  // operator's filename.
  const iconAssets = [
    [brandMarkPath, "image/svg+xml"],
    ["/favicon-16x16.png", "image/png"],
    ["/favicon-32x32.png", "image/png"],
    ["/favicon-48x48.png", "image/png"],
    ["/apple-touch-icon.png", "image/png"],
    ["/icon-192x192.png", "image/png"],
    ["/icon-512x512.png", "image/png"],
    ["/icon-maskable-512x512.png", "image/png"],
    ["/og.png", "image/png"],
  ] as const;

  for (const [path, contentType] of iconAssets) {
    const response = await request.get(path);
    expect(response.status(), `${path} should load`).toBe(200);
    expect(response.headers()["content-type"]).toContain(contentType);
    expect((await response.body()).length).toBeGreaterThan(100);
  }

  const favicon = await request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toMatch(
    /image\/(?:x-icon|vnd\.microsoft\.icon)/,
  );
  expect((await favicon.body()).length).toBeGreaterThan(100);

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest.short_name).toBe(organizationName);
  expect(manifest.theme_color).toBe(themeBackground);
  expect(manifest.background_color).toBe(themeBackground);
  expect(manifest.icons).toHaveLength(3);

  const appIconResponse = await request.get(`/themes/${selectedTheme}/mark.svg`);
  const appIcon = await appIconResponse.text();
  // The mark the origin serves must be byte-for-byte the bundle's own mark.
  // Asserting one theme's palette literals here was the same weld in a
  // different shape: it could only ever pass for Galactic.
  expect(appIcon.replace(/\r\n/g, "\n")).toBe(themeMarkSource.replace(/\r\n/g, "\n"));

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.emulateMedia({ forcedColors: "active" });
  await expect(homeBrand.locator("svg.brand-mark")).toBeVisible();
});

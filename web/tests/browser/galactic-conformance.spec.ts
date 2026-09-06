import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import portalConfig from "../../project42.config.json" with { type: "json" };
import { expectColor, expectNotColor } from "./support/colors";

// Expected token values come from the SELECTED theme's own manifest rather
// than a hardcoded Galactic palette. Those literals previously pinned the
// portal to 06-galactic-guide: changing the theme field in
// project42.config.json failed this required gate and could not deploy, which
// is the opposite of the contract this suite exists to protect.
const selectedTheme: string = portalConfig.theme;
const selectedLayout: string = portalConfig.layout.defaultPreset;

const themeManifest = JSON.parse(
  readFileSync(resolve(`public/themes/${selectedTheme}/theme.json`), "utf8"),
) as { tokens?: Record<string, string> };

// Surface and text colour tokens are asserted; a theme declaring extras is
// free to do so, and a theme that omits one is not failed on that basis here.
const assertedTokenNames = [
  "--p42-bg",
  "--p42-surface",
  "--p42-primary",
  "--p42-accent",
  "--p42-text-title",
  "--p42-text-body",
  "--p42-text-muted",
] as const;

const galacticTokens: Record<string, string> = Object.fromEntries(
  assertedTokenNames
    .filter((name) => themeManifest.tokens?.[name])
    .map((name) => [name, themeManifest.tokens![name]!]),
);

const publicRouteFamilies = [
  "/",
  "/learn",
  "/learn/paths",
  "/learn/ai-foundations",
  "/learn/ai-foundations/what-ai-does",
  "/guide",
  "/guide/resources/agent-safety-checklist",
  "/guide/diagrams",
  "/guide/diagrams/agent-orchestration",
  "/diagrams",
  "/diagrams/agent-orchestration",
  "/resources/agent-safety-checklist",
  "/ondemand",
  "/ondemand/ai-foundations/agents-and-guardrails",
  "/transfer-progress",
  "/account",
  "/learner-data",
  "/about",
  "/roadmap",
  "/releases",
  "/platform",
  "/support",
  "/legal-transparency",
] as const;

test("routes Learn to the landing page and keeps the path catalog distinct", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Learn", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/?$/);
  // /learn is the choice between the two renderings (ADR-0020), NOT a second
  // copy of the home page hero. It asserted "Start curious / Become capable"
  // while /learn was duplicating the landing page after commit 0bbfe97.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Two ways to take the same course",
  );
  await expect(page.getByRole("heading", { level: 2, name: /Read it at your own pace/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Watch it taught/ })).toBeVisible();

  await page.getByRole("link", { name: "Browse learning paths →" }).click();
  await expect(page).toHaveURL(/\/learn\/paths\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Learning paths with a clear next step.",
  );
});

test("uses only Galactic artwork and compact shell treatments on Learn", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    // Pointing the element at the artwork is not the same as the artwork
    // arriving: the theme hero images 404ed behind a correct-looking
    // background-image for five of the six bundles once already.
    const heroArtwork = page.waitForResponse(
      (response) =>
        new RegExp(`/themes/${selectedTheme}/hero\\.png`).test(response.url()),
      { timeout: 15_000 },
    );
    await page.goto("/learn");

    const hero = page.locator(".hero-map");
    await expect(hero).toHaveCSS(
      "background-image",
      new RegExp(`/themes/${selectedTheme}/hero\\.png`),
    );
    expect((await heroArtwork).status()).toBe(200);
    await expect(hero.locator(":scope > *").first()).toHaveCSS("opacity", "0");

    const decorations = await page.locator(".path-card").evaluateAll((cards) =>
      cards.map((card) => getComputedStyle(card, "::after").content),
    );
    expect(decorations).toEqual(decorations.map(() => "none"));

    const footerLink = page.locator(".footer-grid > div:nth-child(2) a").first();
    await expect(footerLink).toHaveCSS("min-height", "0px");
    expect(await footerLink.evaluate((link) => link.getBoundingClientRect().height)).toBeLessThan(32);
  }
});

const protectedRouteFamilies = [
  "/profile",
  "/import-progress",
] as const;

test("uses Galactic presentation without Gallery specimen content", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("data-theme", selectedTheme);
  await expect(page.locator(".portal-poster-hero")).toHaveCSS(
    "background-image",
    new RegExp(`/themes/${selectedTheme}/hero\\.png`),
  );
  await expectColor(
    page.locator(".portal-floating-card"),
    "background-color",
    "rgba(13, 20, 36, 0.94)",
  );
  await expectColor(
    page.locator(".portal-floating-card"),
    "border-top-color",
    "rgba(245, 158, 11, 0.45)",
  );
  await expectColor(
    page.locator(".portal-actions a").first(),
    "background-color",
    "rgb(245, 158, 11)",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Start curious\.\s*Become capable\./,
  );
  await expect(
    page.locator(".portal-actions").getByRole("link", { name: "Start learning" }),
  ).toHaveAttribute("href", "/learn");
  await expect(
    page.locator(
      ".galactic-system-bar, .galactic-subbrands, .galactic-palette, .galactic-badges-bar, .galactic-badge-card",
    ),
  ).toHaveCount(0);
  await expect(page.getByText("Identity idea", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Palette", { exact: true })).toHaveCount(0);

  const brandMarkLoaded = await page.locator(".portal-brand-mark").evaluate((image) =>
    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
  );
  expect(brandMarkLoaded).toBe(true);

  for (const asset of [
    "hero.png",
    "mark.svg",
  ]) {
    const response = await request.get(`/themes/${selectedTheme}/${asset}`);
    expect(response.status(), `${asset} should load`).toBe(200);
    expect((await response.body()).length, `${asset} should not be empty`).toBeGreaterThan(100);
  }

  const computedTokens = await page.locator("html").evaluate((element, names) => {
    const styles = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(name).trim()]));
  }, Object.keys(galacticTokens));
  expect(computedTokens).toEqual(galacticTokens);
});

// Theme is deployment-owned: it comes from project42.config.json only, so a
// stale browser value is discarded rather than blended in. Layout density is
// the axis that IS a per-visitor preference. The two are deliberately not
// symmetric.
test("discards a stale browser theme in favour of the configured theme", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("project42.theme.v1", "01-cosmic-answer");
  });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    selectedTheme,
  );
  expect(
    await page.evaluate(() => window.localStorage.getItem("project42.theme.v1")),
  ).toBeNull();

  await page.goto("/about");
  // The banner uses a surface background, not the accent. Filling a whole
  // section with the accent colour dropped a solid slab into the page that
  // read as a mismatched box; the accent is now a soft tint over the surface.
  await expectNotColor(
    page.locator(".open-source-banner"),
    "background-color",
    "rgb(16, 185, 129)",
  );
  const aboutAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(aboutAccessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/platform");
  await expect(
    page.locator('pre[aria-label="Self-hosting quickstart commands"]'),
  ).toHaveAttribute("tabindex", "0");
  const platformAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(platformAccessibility.violations).toEqual([]);
});

test("keeps the About and profile disclosures aligned and inside the viewport", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const about = page.getByRole("button", { name: "About" });
    await about.click();
    const aboutPanel = page.locator(".header-menu-panel").filter({
      has: page.getByRole("link", { name: "About Project 42" }),
    });
    await expect(aboutPanel).toBeVisible();
    const geometry = await aboutPanel.evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      const links = [...panel.querySelectorAll("a")];
      return {
        left: bounds.left,
        right: bounds.right,
        linkAlignment: links.map((link) => getComputedStyle(link).justifyContent),
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(viewport.width);
    expect(geometry.linkAlignment).not.toContain("center");
    expect(new Set(geometry.linkAlignment)).toEqual(new Set(["flex-start"]));

    await page.keyboard.press("Escape");
    await expect(about).toBeFocused();
    await expect(aboutPanel).toBeHidden();

    const profile = page.getByRole("button", { name: "Account and profile" });
    const initialUrl = page.url();
    await profile.click();
    await expect(page).toHaveURL(initialUrl);
    await expect(profile).toHaveAttribute("aria-expanded", "true");
    const profilePanel = page.locator(".header-menu-panel").filter({
      has: page.getByRole("link", { name: "My progress" }),
    });
    await expect(profilePanel).toBeVisible();
    const profileBounds = await profilePanel.boundingBox();
    expect(profileBounds).not.toBeNull();
    expect(profileBounds!.x).toBeGreaterThanOrEqual(0);
    expect(profileBounds!.x + profileBounds!.width).toBeLessThanOrEqual(
      viewport.width,
    );
  }
});

test("keeps every public route family inside the Galactic presentation boundary", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);

    for (const route of publicRouteFamilies) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("html"), route).toHaveAttribute(
        "data-theme",
        selectedTheme,
      );
      await expectColor(page.locator("body"), "background-color", "rgb(9, 13, 22)", {
        message: route,
      });
      await expect(page.locator("main"), route).toBeVisible();
      await expectColor(
        page.locator(".site-header"),
        "background-color",
        "rgba(9, 13, 22, 0.96)",
        { message: route },
      );

      const presentation = await page.evaluate(() => {
        const heading = document.querySelector("main h1, main h2");
        const headingStyles = heading ? getComputedStyle(heading) : null;
        return {
          bodyFont: getComputedStyle(document.body).fontFamily,
          headingFont: headingStyles?.fontFamily ?? "",
          headingColor: headingStyles?.color ?? "",
          hasHorizontalOverflow:
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });

      expect(presentation.bodyFont, `${route} body font`).toContain("Inter");
      expect(presentation.headingFont, `${route} heading font`).toContain(
        "Bricolage Grotesque",
      );
      expect(presentation.headingColor, `${route} heading color`).toBe("rgb(254, 243, 199)");
      expect(presentation.hasHorizontalOverflow, `${route} horizontal overflow`).toBe(false);
    }
  }
});

test("preserves accessible focus, hover, reduced-motion, and contrast states", async ({
  page,
}) => {
  await page.goto("/");
  const primaryAction = page.locator(".portal-actions a").first();

  await primaryAction.hover();
  await expectColor(primaryAction, "background-color", "rgb(251, 191, 36)");

  await primaryAction.focus();
  await expect(primaryAction).toBeFocused();
  const focusIndicator = await primaryAction.evaluate((element) => {
    const styles = getComputedStyle(element);
    return `${styles.outlineStyle} ${styles.outlineWidth} ${styles.boxShadow}`;
  });
  expect(focusIndicator).not.toBe("none 0px none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(primaryAction).toHaveCSS("transition-duration", "0s");

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

// This test used to follow the redirect all the way to
// project42dev.ciamlogin.com and assert the authorize URL. That only worked
// because the browser reached the *live* account API and the *live* identity
// provider: response_type and redirect_uri on that authorize URL are the
// account API's contract, not the portal's, and the portal cannot produce
// them without either a production round trip or a stub that would merely
// assert itself. The API's side of the handshake is covered offline by the
// OIDC canary in the ops post-deployment smoke (Invoke-PostDeploymentSmoke:
// oidcStartStatus 302, secure session retained, invalid code rejected).
//
// What the portal owns, and what this now checks hermetically, is the
// boundary itself: a protected route must never render its own content, and
// must hand the browser to the account API's auth-start endpoint over HTTPS
// with a return target pointing back at that same route.
test("preserves the protected-profile authentication boundary", async ({ page }) => {
  const apiOrigin = process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN;
  test.skip(
    !apiOrigin,
    "The authentication boundary requires account-API configuration.",
  );

  for (const route of protectedRouteFamilies) {
    // Hold the hand-off at the account API so the run never depends on
    // identity-provider DNS. The request the portal makes is the assertion.
    await page.route(`${apiOrigin}/v1/auth/start**`, async (routeCall) => {
      await routeCall.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>identity provider</title>",
      });
    });
    const authStart = page.waitForRequest(`${apiOrigin}/v1/auth/start**`);

    await page.goto(route);
    const startUrl = new URL((await authStart).url());

    expect(startUrl.protocol).toBe("https:");
    expect(startUrl.pathname).toBe("/v1/auth/start");

    const returnTo = startUrl.searchParams.get("return_to");
    expect(returnTo).toBeTruthy();
    expect(new URL(returnTo!).pathname).toBe(route);

    await page.unroute(`${apiOrigin}/v1/auth/start**`);
  }
});

test("serves the machine-readable policy and keeps admin theming isolated", async ({
  page,
  request,
}) => {
  const policyResponse = await request.get("/learner-data/policy");
  expect(policyResponse.status()).toBe(200);
  expect(policyResponse.headers()["content-type"]).toContain("application/json");
  expect(await policyResponse.json()).toMatchObject({ policyVersion: expect.any(String) });

  await page.goto("/admin");
  await expect(page.locator(".admin-portal-root")).toHaveAttribute(
    "data-theme",
    "admin-control",
  );
  await expect(page.locator(".admin-portal-root")).toBeVisible();
});

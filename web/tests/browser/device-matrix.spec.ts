import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEVICE_MATRIX, NAV_SCROLL_BAND, SWEEP_WIDTHS } from "./support/devices";

// THE CROSS-DEVICE GATE.
//
// Every browser journey in this repository ran on desktop Chromium at 1280px
// until today. That is how `.site-header { overflow-x: clip }` shipped and left
// the profile menu dead on iPhone for months: Chromium implements single-axis
// clip to the letter, so the only engine anyone tested was the one engine that
// could not see the bug. mobile-viewport.spec.ts closed the iPhone half of that
// hole. This file closes the rest of it -- Android phones, tablets, landscape,
// Firefox, the installed PWA surface, and the widths that fall between the two
// breakpoints.
//
// Every test here runs under EVERY project in the matrix (see
// support/devices.ts), and every failure names the project and the element, so
// "the About menu clips" is never a bug report you have to go and reproduce by
// hand to find out where.
//
// WHAT THIS FILE DOES NOT DO
//
// It does not re-test the phone ramp. mobile-viewport.spec.ts owns the 320px
// typography floor, the iOS focus-zoom rule and the safe-area insets, and runs
// on its own iPhone projects. Duplicating those here would double the runtime
// to re-measure something already gated.

const PROFILE_TRIGGER = ".header-actions .header-menu-trigger";
const PROFILE_PANEL = ".header-actions .header-menu-panel";
const ABOUT_TRIGGER = "#primary-navigation .header-menu-trigger";
const ABOUT_PANEL = "#primary-navigation .header-menu-panel";
const NAV_TOGGLE = ".nav-toggle";
const MIN_TAP = 44;

// Panel entries are named by ROUTE. copy/chrome.ts is explicit that the words
// belong to the operator and the routes belong to the product, so a gate keyed
// to wording breaks on every site that renamed a menu item -- and passes on one
// that deleted the destination and kept the word.
/** In the profile panel, behind sign-in: trial-pressed, never followed. */
const PROFILE_PROTECTED_ROUTE = "/profile";
/** In the profile panel, public: safe to actually follow. */
const PROFILE_PUBLIC_ROUTE = "/account";
/** In the About panel, same-origin (the Gallery entry is target=_blank). */
const ABOUT_ROUTE = "/platform";

/** The project this test is running under, for failure messages. */
function device(): string {
  return test.info().project.name;
}

function options(): Record<string, unknown> {
  return test.info().project.use as unknown as Record<string, unknown>;
}

function isTouch(): boolean {
  return options().hasTouch === true;
}

function engine(): string {
  return test.info().project.name.split("-")[0];
}

/**
 * Whether this project owns the width sweep.
 *
 * playwright.config.ts already filters the sweep out of every other project
 * with grepInvert, so this is a second belt: run the whole file under a
 * hand-picked `--project` and the sweep still refuses to resize a fixed device
 * viewport rather than quietly measuring the wrong thing.
 */
function sweeps(): boolean {
  return /^(chromium|webkit|firefox)-desktop-1280$/.test(device());
}

/**
 * A real press.
 *
 * On a touch profile this has to be `tap()`: the header disclosures install
 * document-level `touchstart` dismissal listeners, and a synthetic click never
 * exercises them -- which is precisely the class of thing a desktop-only suite
 * cannot see. On a pointer profile `tap()` throws, so those get `click()`.
 */
async function press(locator: Locator): Promise<void> {
  if (isTouch()) await locator.tap();
  else await locator.click();
}

/** The same press, run for its actionability check only -- it follows nothing. */
async function pressTrial(locator: Locator): Promise<void> {
  if (isTouch()) await locator.tap({ trial: true });
  else await locator.click({ trial: true });
}

/**
 * The primary nav is a disclosure at or below 760px and a row above it. Open it
 * when it is collapsed so the About menu is reachable either way; return
 * whether anything was opened so a caller can say which mode it measured.
 */
async function revealNav(page: Page): Promise<"disclosure" | "row"> {
  const toggle = page.locator(NAV_TOGGLE);
  if (!(await toggle.isVisible())) return "row";
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await press(toggle);
  await expect(page.locator("#primary-navigation")).toBeVisible();
  return "disclosure";
}

/**
 * Every ancestor of a panel that clips in EITHER axis, up to <html>.
 *
 * This is the assertion that actually catches this class of bug. The
 * behavioural halves -- tap, hit-test, navigate -- pass on broken code under
 * whichever engine happens to implement the clipping correctly, which is how
 * the iPhone defect survived months of green runs. A panel positioned outside
 * its container must not have a clipping ancestor in ANY axis, in any engine;
 * gate the CSS, not one engine's reading of it.
 *
 * Note `overflow-x: auto` is not a lesser offence than `hidden`. Per CSS
 * Overflow 3, when one axis is `visible` and the other is not, the `visible`
 * one COMPUTES to `auto` -- so `overflow-x: auto` silently makes the box clip
 * (and scroll) vertically too. That is the About menu's whole problem.
 */
async function clippingAncestors(page: Page, panelSelector: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const panel = document.querySelector<HTMLElement>(selector);
    if (!panel) return [`no panel matched ${selector}`];
    const found: string[] = [];
    for (let ancestor = panel.parentElement; ancestor; ancestor = ancestor.parentElement) {
      // <html> and <body> are exempt: clipping the document is the supported
      // way to stop a sideways scroll, and it cannot hide a panel inside the
      // header -- the document is taller than the header by the whole page.
      if (ancestor === document.documentElement || ancestor === document.body) continue;
      const styles = getComputedStyle(ancestor);
      if (styles.overflowX === "visible" && styles.overflowY === "visible") continue;
      const name = `${ancestor.tagName.toLowerCase()}${
        String(ancestor.className).trim() ? `.${String(ancestor.className).trim().split(/\s+/)[0]}` : ""
      }`;
      found.push(`${name} {overflow-x: ${styles.overflowX}; overflow-y: ${styles.overflowY}}`);
    }
    return found;
  }, panelSelector);
}

/** How far the panel hangs past the bottom of the box that would clip it. */
async function overhang(page: Page, panelSelector: string, containerSelector: string): Promise<number> {
  return page.evaluate(
    ([panelSel, containerSel]) => {
      const panel = document.querySelector<HTMLElement>(panelSel);
      const container = panel?.closest(containerSel) ?? document.querySelector(containerSel);
      if (!panel || !container) return Number.NaN;
      return panel.getBoundingClientRect().bottom - container.getBoundingClientRect().bottom;
    },
    [panelSelector, containerSelector] as const,
  );
}

/**
 * What the page actually paints at the centre of a panel entry.
 *
 * The entry is named by its ROUTE, not by its words. copy/chrome.ts says it in
 * as many words -- "Navigation labels are copy, not routing: the routes are
 * product and fixed, the words on them are the operator's" -- so a gate keyed
 * to "Platform" fails on every site that renamed the item, and passes on one
 * that deleted the destination and kept the word.
 *
 * Returns "hit" when the entry is what is painted there, and otherwise names
 * what is, so a failure says which element is in the way.
 */
async function whatIsUnder(page: Page, panelSelector: string, route: string): Promise<string> {
  return page.evaluate(
    ([selector, href]) => {
      const link = [...document.querySelectorAll<HTMLAnchorElement>(`${selector} a`)].find((candidate) =>
        new URL(candidate.href, location.href).pathname.replace(/\/$/, "") === href.replace(/\/$/, ""),
      );
      if (!link) return `no link to ${href} in ${selector}`;

      const probe = () => {
        const box = link.getBoundingClientRect();
        return {
          box,
          hit: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2),
        };
      };

      let { box, hit } = probe();
      if (hit === link || link.contains(hit)) return "hit";

      if (!hit) {
        // Off the screen is only a defect if the reader cannot BRING it onto
        // the screen. Ask the browser to scroll it into view -- the same thing
        // a finger would do -- and measure again, so "unreachable" means
        // unreachable rather than "below the fold". A panel inside a
        // position: sticky header cannot be scrolled to: the header stays
        // pinned and the panel travels with it.
        link.scrollIntoView({ block: "center", behavior: "auto" });
        ({ box, hit } = probe());
        if (hit === link || link.contains(hit)) return "hit";
        if (!hit) {
          return `nothing -- the entry sits at y=${Math.round(box.top + box.height / 2)} in a ${Math.round(
            document.documentElement.clientHeight,
          )}px viewport and STAYS there after scrollIntoView, so no amount of scrolling reaches it`;
        }
      }

      return `${hit!.tagName.toLowerCase()}${
        String(hit!.className ?? "").trim() ? `.${String(hit!.className).trim().split(/\s+/)[0]}` : ""
      }`;
    },
    [panelSelector, route] as const,
  );
}

/** A panel entry, located by the route it goes to rather than by its wording. */
function entry(page: Page, panelSelector: string, route: string): Locator {
  return page.locator(`${panelSelector} a[href="${route}"], ${panelSelector} a[href="${route}/"]`).first();
}

/** The width the page is actually laid out at, whatever the project declared. */
async function viewportWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.clientWidth);
}

/** documentElement.scrollWidth against clientWidth, plus who is pushing it. */
async function horizontalOverflow(page: Page): Promise<{
  scrollWidth: number;
  clientWidth: number;
  culprits: string[];
}> {
  return page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const culprits: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (element.getBoundingClientRect().right <= clientWidth + 1) continue;
      // An element inside its own scroll container is allowed to be wider than
      // the screen -- that is what a scrollable table or code block is.
      let clipped = false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden" || overflowX === "clip") {
          clipped = true;
          break;
        }
      }
      if (!clipped) {
        culprits.push(
          `${element.tagName.toLowerCase()}.${String(element.className).trim().split(/\s+/).slice(0, 2).join(".")} right=${Math.round(
            element.getBoundingClientRect().right,
          )}`,
        );
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth,
      culprits: culprits.slice(0, 5),
    };
  });
}

/**
 * A path and a module that a reader can actually REACH by browsing, discovered
 * by walking /learn/paths and then that path's page.
 *
 * Discovered rather than hardcoded so a curriculum change cannot silently stop
 * exercising the module template. Discovered from the RENDERED PAGES rather
 * than from the sitemap for a sharper reason: the sitemap is not the same set.
 * Six of the fourteen published paths are in the sitemap and are not linked
 * from /learn/paths at all, so a journey seeded from the sitemap fails on every
 * device for a reason that has nothing to do with any device. That gap is a
 * real finding and is reported separately; this helper's job is to give the
 * per-device navigation test a route a reader can genuinely walk.
 */
let cachedJourney: { path: string; module: string } | null = null;
async function discoverJourney(page: Page): Promise<{ path: string; module: string }> {
  if (cachedJourney) return cachedJourney;

  await page.goto("/learn/paths/", { waitUntil: "domcontentloaded" });
  const path = await page.evaluate(() => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>("main a")]
      .map((candidate) => new URL(candidate.href, location.href).pathname.replace(/\/$/, ""))
      .find((route) => /^\/learn\/[^/]+$/.test(route) && route !== "/learn/paths");
    return link ?? null;
  });
  expect(path, "/learn/paths links to no learning path at all").not.toBeNull();

  await page.goto(`${path}/`, { waitUntil: "domcontentloaded" });
  const module = await page.evaluate((pathRoute) => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>("main a")]
      .map((candidate) => new URL(candidate.href, location.href).pathname.replace(/\/$/, ""))
      .find((route) => route.startsWith(`${pathRoute}/`));
    return link ?? null;
  }, path!);
  expect(module, `${path} links to none of its own modules`).not.toBeNull();

  cachedJourney = { path: path!, module: module! };
  return cachedJourney;
}

// ---------------------------------------------------------------------------
// 1. Both header menus open on a real press, and nothing clips them.
// ---------------------------------------------------------------------------

test.describe("header menus", () => {
  test("the profile menu opens and its destinations are hit-testable", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const trigger = page.locator(PROFILE_TRIGGER);
    const panel = page.locator(PROFILE_PANEL);

    await expect(trigger, `${device()}: no profile trigger in the header`).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    // Every destination is in the served HTML whether the panel is open or
    // shut -- the link checker and the Pages export read that, not the box.
    await expect(panel.locator("a")).not.toHaveCount(0);

    await press(trigger);
    await expect(trigger, `${device()}: the profile trigger did not toggle`).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(panel, `${device()}: the profile panel did not appear`).toBeVisible();

    // Visible is not reachable. A trial press runs the whole actionability
    // check -- including the hit test -- without following the link. /profile
    // is a protected route, and following it signed out hands the browser to
    // the identity provider, which is not this test's business.
    await pressTrial(entry(page, PROFILE_PANEL, PROFILE_PROTECTED_ROUTE));
    const profileHit = await whatIsUnder(page, PROFILE_PANEL, PROFILE_PROTECTED_ROUTE);
    expect(
      profileHit,
      `${device()} (${await viewportWidth(page)}px): the profile menu reports itself open, but the page paints ` +
        `"${profileHit}" where its ${PROFILE_PROTECTED_ROUTE} entry is. A menu you cannot touch has not opened.`,
    ).toBe("hit");

    // Then a real press on the public destination in the same panel.
    await press(entry(page, PROFILE_PANEL, PROFILE_PUBLIC_ROUTE));
    await expect(page, `${device()}: the profile menu link did not navigate`).toHaveURL(/\/account\/?$/);
  });

  test("the About menu opens and its destinations are hit-testable", async ({ page }) => {
    // KNOWN, UNFIXED, AND DELIBERATELY NOT PAPERED OVER.
    //
    // On a phone held sideways this fails, and the cause is not the About menu.
    // Below 761px the primary nav collapses behind a disclosure and opens as a
    // column of full-width 48px rows: five rows plus the 66px header is about
    // 306px, which is the ENTIRE viewport of a Pixel 10 in landscape (308px)
    // and nearly all of an iPhone 14's (340px). The About panel then opens at
    // y=381 -- below the bottom of the screen -- and because it is absolutely
    // positioned inside a `position: sticky` header it travels with the header
    // and stays there: the test calls scrollIntoView and measures again, and
    // the entry does not move. It is a menu that cannot be reached at all.
    //
    // That is the same class of defect the portrait phone ramp fixed ("you
    // landed on the site and saw navigation"), and the remedy is an information
    // -architecture decision -- an inline accordion, a bottom sheet, shorter
    // rows -- not something a test should pick. So it is marked FAILING rather
    // than skipped or fixed: the assertion still runs and still prints the
    // measurement, the suite stays green so this gate can ship, and the run
    // turns RED the moment someone fixes it and leaves this annotation behind.
    const size = (options().viewport ?? { width: 0, height: 0 }) as { width: number; height: number };
    test.fail(
      isTouch() && size.width <= 760 && size.height < 400,
      `${device()}: the open nav disclosure alone fills a ${size.height}px-tall viewport, so the About panel ` +
        "opens off the bottom of the screen and cannot be scrolled to. Unfixed pending an IA decision.",
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const mode = await revealNav(page);
    const trigger = page.locator(ABOUT_TRIGGER);
    const panel = page.locator(ABOUT_PANEL);

    await expect(trigger, `${device()}: no About trigger (nav rendered as a ${mode})`).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel.locator("a")).not.toHaveCount(0);

    await press(trigger);
    await expect(trigger, `${device()}: the About trigger did not toggle`).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(panel, `${device()}: the About panel did not appear`).toBeVisible();

    const aboutHit = await whatIsUnder(page, ABOUT_PANEL, ABOUT_ROUTE);
    expect(
      aboutHit,
      `${device()} (${await viewportWidth(page)}px, nav rendered as a ${mode}): the About menu reports itself open, ` +
        `but the page paints "${aboutHit}" where its ${ABOUT_ROUTE} entry is. A menu you cannot touch has not opened.`,
    ).toBe("hit");

    // A real press on a same-origin destination. The Gallery entry in the same
    // panel is target=_blank and is deliberately not the one followed here.
    await press(entry(page, ABOUT_PANEL, ABOUT_ROUTE));
    await expect(page, `${device()}: the About menu link did not navigate`).toHaveURL(/\/platform\/?$/);
  });

  test("no ancestor of either header panel clips it", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // --- profile panel
    await press(page.locator(PROFILE_TRIGGER));
    await expect(page.locator(PROFILE_PANEL)).toBeVisible();
    const profileOverhang = await overhang(page, PROFILE_PANEL, ".site-header");
    expect(
      profileOverhang,
      `${device()}: the profile panel no longer hangs below the header, so this gate would be vacuous`,
    ).toBeGreaterThan(0);
    const profileClippers = await clippingAncestors(page, PROFILE_PANEL);
    expect(
      profileClippers,
      `${device()}: the profile menu hangs ${Math.round(profileOverhang)}px below the header and these ancestors clip it:\n  ${profileClippers.join(
        "\n  ",
      )}`,
    ).toEqual([]);
    await page.keyboard.press("Escape");

    // --- About panel
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await revealNav(page);
    await press(page.locator(ABOUT_TRIGGER));
    await expect(page.locator(ABOUT_PANEL)).toBeVisible();
    const aboutOverhang = await overhang(page, ABOUT_PANEL, "#primary-navigation");
    expect(
      aboutOverhang,
      `${device()}: the About panel no longer hangs below the nav, so this gate would be vacuous`,
    ).toBeGreaterThan(0);
    const aboutClippers = await clippingAncestors(page, ABOUT_PANEL);
    expect(
      aboutClippers,
      `${device()}: the About menu hangs ${Math.round(aboutOverhang)}px below #primary-navigation and these ancestors clip it:\n  ${aboutClippers.join(
        "\n  ",
      )}\nAn overflow value other than "visible" on ANY axis clips both axes: CSS Overflow 3 computes a "visible" axis to "auto" when its partner is not visible. Clip something that does not contain the panel.`,
    ).toEqual([]);
  });

  test("the keyboard contract survives on both menus", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const trigger = page.locator(PROFILE_TRIGGER);
    const panel = page.locator(PROFILE_PANEL);

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger, `${device()}: Enter did not open the profile menu`).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(panel).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(trigger, `${device()}: Escape dropped focus instead of returning it`).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// 2. Primary navigation: home -> a learning path -> a module page.
// ---------------------------------------------------------------------------

/** One hop of the journey: find the link, press it, land where it promised. */
async function hop(page: Page, selector: string, destination: RegExp, from: string): Promise<void> {
  const link = page.locator(selector).first();
  await expect(
    link,
    `${device()}: ${from} offers no reachable link matching ${selector}, so the journey stops here`,
  ).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  await press(link);
  await expect(page, `${device()}: pressing that link did not land on ${destination}`).toHaveURL(destination);
}

test("home to a learning path to a module, by pressing links", async ({ page }) => {
  const journey = await discoverJourney(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // Every hop is a real press on a link that is actually on the screen, in the
  // order a reader meets them: the nav, then the catalogue, then the path, then
  // the module. `goto` would skip exactly the thing under test -- whether the
  // affordance is reachable on THIS device.
  //
  // `:visible` matters on the first hop. The nav carries TWO links to /learn --
  // the "Start learning" call to action and the "Learn" item -- and the call to
  // action is display:none above 760px, so taking the first match regardless
  // waits out the timeout on a hidden element on every tablet and desktop row.
  await revealNav(page);
  await hop(page, '#primary-navigation a[href^="/learn"]:visible', /\/learn\/?$/, "the primary navigation");
  await hop(page, 'main a[href^="/learn/paths"]', /\/learn\/paths\/?$/, "/learn");
  await hop(page, `main a[href^="${journey.path}"]`, new RegExp(`${journey.path}/?$`), "/learn/paths");
  await expect(page.locator("main h1"), `${device()}: the path page rendered no heading`).toBeVisible();
  await hop(page, `main a[href^="${journey.module}"]`, new RegExp(`${journey.module}/?$`), journey.path);

  const heading = page.locator("main h1");
  await expect(heading, `${device()}: the module page rendered no heading`).toBeVisible();
  expect((await heading.innerText()).trim().length, `${device()}: the module heading is empty`).toBeGreaterThan(0);
  const bodyLength = await page.locator("main").innerText();
  expect(
    bodyLength.trim().length,
    `${device()}: the module page rendered a heading and no body`,
  ).toBeGreaterThan(400);
});

// ---------------------------------------------------------------------------
// 2b. RESUME: the site remembers which module you were on.
//
// Opening /learn/<path>/<module>/ records a visit by itself --
// ModuleVisitTracker calls ProgressProvider.recordVisit on a timer once the
// provider has hydrated -- and the record carries a `recentModule`. The
// contract a reader experiences is: leave that module, come back to the site,
// and be offered the way back in by name.
//
// Signed out, on purpose. That is what a plain visitor gets, it needs no
// credentials, and it is the case the owner is complaining about.
// ---------------------------------------------------------------------------

/** The surfaces a returning reader could plausibly be offered a way back in. */
const RESUME_SURFACES = ["/", "/learn/", "/learn/paths/", "/profile/"] as const;

/**
 * Anything on this page that offers the reader the named module back.
 *
 * Two shapes count, and the difference is reported rather than collapsed: a
 * link that goes to the module itself (the real affordance), and any visible
 * control whose words begin "Continue" or "Resume" (which might name a module
 * or might, like the one on /profile, just point at the catalogue).
 */
async function resumeAffordances(
  page: Page,
  moduleRoute: string,
): Promise<{ toTheModule: string[]; continueish: string[] }> {
  // The app does a soft navigation of its own shortly after hydration on some
  // routes, which destroys the execution context mid-evaluate. Settle first,
  // and retry once rather than reading that as a finding.
  await page.waitForLoadState("load");
  const scan = (): Promise<{ toTheModule: string[]; continueish: string[] }> => page.evaluate((route) => {
    const toTheModule: string[] = [];
    const continueish: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("a, button")) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (getComputedStyle(element).visibility === "hidden") continue;
      const words = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      const href =
        element instanceof HTMLAnchorElement
          ? new URL(element.href, location.href).pathname.replace(/\/$/, "")
          : "";
      if (href === route) toTheModule.push(`${words || "(no words)"} -> ${href}`);
      else if (/^(continue|resume|pick up)/i.test(words)) continueish.push(`${words} -> ${href || "(button)"}`);
    }
    return { toTheModule, continueish };
  }, moduleRoute);

  return scan().catch(async () => {
    await page.waitForTimeout(500);
    return scan();
  });
}

test("a module you opened is offered back to you when you return", async ({ page }) => {
  // KNOWN, UNFIXED, AND REPORTED RATHER THAN PAPERED OVER.
  //
  // There is no resume affordance on any surface, on any device. The visit IS
  // recorded -- ModuleVisitTracker -> recordVisit -> recentModule -- and the
  // component that would render it, ProgressSnapshot, produces exactly the
  // right thing ("Continue <module title> ->", linked to the module). It is
  // never mounted: nothing in the application imports it. The only other
  // "Continue" in the header/chrome is on /profile, and it is a fixed link to
  // /learn/paths that names no module.
  //
  // Nothing reads the device-local record either. ProgressProvider's hydration
  // says so in as many words -- "Otherwise, start with empty progress. No
  // localStorage reads." -- and readDeviceLocalProgress, which exists and is
  // unit-tested, is called by no component. So a reload starts from nothing
  // even in the cases where the in-memory record would have survived.
  //
  // Marked FAILING rather than deleted or skipped: the assertion runs on every
  // device, prints which surfaces were searched and what was found, and the
  // run turns RED the moment someone ships the feature and leaves this
  // annotation behind. Whether resume belongs on the home page, on /learn, or
  // in the header is a product decision, which is why this is not a fix.
  // P42_SHOW_RESUME_EVIDENCE=1 drops the annotation so the run prints the
  // measurement -- which surfaces were searched and what was on each -- as a
  // real failure. That is how the evidence in this comment was gathered, and
  // how to re-gather it when someone asks whether it is still true.
  if (!process.env.P42_SHOW_RESUME_EVIDENCE) {
    test.fail(
      true,
      `${device()}: no surface offers the last-opened module back. ProgressSnapshot -- the only component that ` +
        "renders it -- is imported by nothing. See the comment above this test.",
    );
  }

  const journey = await discoverJourney(page);

  // A CONTROL PASS FIRST.
  //
  // Without one this test lies. /learn carries a hardcoded "Begin the first
  // module" call to action pointing at the very module discoverJourney picks,
  // so a naive "is there a link to the module" check passes on a site with no
  // resume feature whatsoever -- it did, on the first run of this test. So
  // measure what every surface offers BEFORE anything is visited, and require
  // the resume entry to be something the visit ADDED.
  const before = new Map<string, string[]>();
  for (const surface of RESUME_SURFACES) {
    await page.goto(surface, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    before.set(surface, (await resumeAffordances(page, journey.module)).toTheModule);
  }

  await page.goto(`${journey.module}/`, { waitUntil: "domcontentloaded" });
  const title = (await page.locator("main h1").innerText()).trim();
  // ModuleVisitTracker records on a setTimeout(0) AFTER the provider hydrates,
  // which itself runs on a timer. Give it room; this is not a race the test
  // should win by luck.
  await page.waitForTimeout(1_500);

  // Leave the way a reader leaves -- press a link, so the client-side
  // transition keeps the provider mounted and the in-memory record alive.
  // This is the EASIEST version of the contract to satisfy: no persistence is
  // required at all, only that something renders what was recorded.
  await press(page.locator(".site-header a.brand").first());
  await expect(page).toHaveURL(/\/$/);
  await page.waitForLoadState("load");

  const searched: string[] = [];
  let offered: { surface: string; entry: string } | null = null;

  for (const surface of RESUME_SURFACES) {
    if (surface !== "/") await page.goto(surface, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(600);
    const found = await resumeAffordances(page, journey.module);
    const added = found.toTheModule.filter((item) => !(before.get(surface) ?? []).includes(item));
    searched.push(
      `${surface}: ${
        added.length === 0
          ? `nothing new links to the module (${(before.get(surface) ?? []).length} pre-existing link(s) ignored)`
          : added.join(", ")
      }${found.continueish.length > 0 ? ` | continue-ish present: ${found.continueish.join(", ")}` : ""}`,
    );
    if (!offered && added.length > 0) offered = { surface, entry: added[0] };
  }

  expect(
    offered,
    `${device()}: opened "${title}" (${journey.module}), left it, and no surface offered it back.\n  ${searched.join(
      "\n  ",
    )}\nLinks that were already there before the visit do not count -- /learn ships a fixed "begin the first module" action.`,
  ).not.toBeNull();

  // Naming it is half the contract; the other half is that following it lands
  // back on the module rather than on the catalogue.
  await page.goto(offered!.surface, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await press(page.locator(`a[href="${journey.module}"], a[href="${journey.module}/"]`).first());
  await expect(
    page,
    `${device()}: the resume entry on ${offered!.surface} did not land back on the module`,
  ).toHaveURL(new RegExp(`${journey.module}/?$`));
});

// ---------------------------------------------------------------------------
// 3. No horizontal overflow, at this device's viewport.
// ---------------------------------------------------------------------------

test("no route scrolls sideways on this device", async ({ page }) => {
  const journey = await discoverJourney(page);
  const routes = ["/", "/learn/", "/learn/paths/", "/guide/", "/support/", `${journey.module}/`];
  const offenders: string[] = [];

  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(200);
    const measured = await horizontalOverflow(page);
    if (measured.scrollWidth > measured.clientWidth + 1) {
      offenders.push(
        `${route}: scrollWidth ${measured.scrollWidth} > clientWidth ${measured.clientWidth} [${measured.culprits.join("; ")}]`,
      );
    }
  }

  expect(offenders, `${device()}: content wider than the screen:\n  ${offenders.join("\n  ")}`).toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. Header tap targets.
// ---------------------------------------------------------------------------

test("every header control is at least 44x44 CSS px", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await revealNav(page);

  const offenders = await page.evaluate((minimum) => {
    const results: string[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      ".site-header a, .site-header button, .site-header [role=button]",
    );
    for (const control of controls) {
      const styles = getComputedStyle(control);
      if (styles.display === "none" || styles.visibility === "hidden") continue;
      const box = control.getBoundingClientRect();
      // Off-screen affordances (the skip link parks above the viewport) and
      // anything laid out at zero are not tappable and not defects.
      if (box.width === 0 || box.height === 0) continue;
      if (box.bottom < 0 || box.right < 0) continue;
      if (box.width < minimum || box.height < minimum) {
        const name =
          (control.textContent ?? "").trim().slice(0, 32) ||
          control.getAttribute("aria-label") ||
          control.tagName.toLowerCase();
        results.push(
          `${control.tagName.toLowerCase()}.${String(control.className).trim().split(/\s+/).slice(0, 2).join(".")} "${name}" is ${box.width.toFixed(
            1,
          )}x${box.height.toFixed(1)}`,
        );
      }
    }
    return results;
  }, MIN_TAP);

  expect(
    offenders,
    `${device()}: header controls under ${MIN_TAP}x${MIN_TAP} CSS px (WCAG 2.5.8 / iOS HIG):\n  ${offenders.join("\n  ")}`,
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// 5. The installed-PWA surface.
// ---------------------------------------------------------------------------

test.describe("the installed app", () => {
  test("the manifest is served, valid, and every icon resolves", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const href = await page.getAttribute('link[rel="manifest"]', "href");
    expect(href, `${device()}: the document declares no manifest`).toBeTruthy();

    const response = await page.request.get(href!);
    expect(response.status(), `${device()}: ${href} did not serve`).toBe(200);
    expect(
      response.headers()["content-type"] ?? "",
      `${device()}: ${href} is not served as a manifest`,
    ).toMatch(/application\/(manifest\+json|json)/);

    const manifest = JSON.parse(await response.text()) as {
      start_url?: string;
      scope?: string;
      display?: string;
      icons?: { src: string; sizes?: string; purpose?: string }[];
    };
    expect(manifest.start_url, `${device()}: the manifest has no start_url`).toBeTruthy();
    expect(manifest.display, `${device()}: the manifest does not declare standalone`).toBe("standalone");
    expect(manifest.icons?.length ?? 0, `${device()}: the manifest declares no icons`).toBeGreaterThan(0);
    expect(
      manifest.icons?.some((icon) => (icon.purpose ?? "").includes("maskable")),
      `${device()}: no maskable icon, so the installed app gets a letterboxed square`,
    ).toBe(true);

    const broken: string[] = [];
    for (const icon of manifest.icons ?? []) {
      const iconResponse = await page.request.get(icon.src);
      const type = iconResponse.headers()["content-type"] ?? "";
      if (iconResponse.status() !== 200 || !type.startsWith("image/")) {
        broken.push(`${icon.src} -> ${iconResponse.status()} ${type || "(no content-type)"}`);
      }
    }
    expect(broken, `${device()}: manifest icons that do not resolve:\n  ${broken.join("\n  ")}`).toEqual([]);

    // start_url is what the launcher opens. If it 404s, the installed app opens
    // on an error page and nothing in a browser tab would ever have shown it.
    const start = await page.request.get(manifest.start_url!);
    expect(start.status(), `${device()}: start_url ${manifest.start_url} does not load`).toBe(200);
  });

  test("the service worker registers", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });

    // WHICH SURFACE IS UNDER TEST.
    //
    // The worker is written by `npm run pages:export` and by nothing else --
    // it is a file in the published artifact, not a route the application
    // serves. playwright.config.ts drives the vinext server, which therefore
    // 404s /sw.js; playwright.pages.config.ts drives the exported artifact,
    // which serves it exactly as project-42.dev does.
    //
    // Skipping with the reason stated is the honest outcome on the first of
    // those and a silent pass is not: this suite has no worker to register and
    // says so. Under `npm run test:pages` the same test runs for real.
    const script = await page.request.get("/sw.js");
    test.skip(
      script.status() === 404,
      `${device()}: this surface serves no /sw.js. The worker exists only in the GitHub Pages export ` +
        "(scripts/export-github-pages.mjs writes it), so registration can only be proven by " +
        "`npm run test:pages`, which serves the exported artifact.",
    );

    expect(script.status(), `${device()}: /sw.js does not serve`).toBe(200);
    expect(
      script.headers()["content-type"] ?? "",
      `${device()}: /sw.js is not served as JavaScript, so no browser will run it`,
    ).toMatch(/javascript/);

    // The registration component runs on `load`, so poll rather than read once.
    const scope = await page
      .waitForFunction(
        async () => {
          if (!("serviceWorker" in navigator)) return "unsupported";
          const registration = await navigator.serviceWorker.getRegistration();
          return registration ? registration.scope : null;
        },
        undefined,
        { timeout: 10_000 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => null);

    if (scope === "unsupported") {
      test.info().annotations.push({
        type: "engine-limit",
        description: `${device()}: this browser build exposes no navigator.serviceWorker, so registration cannot be proven here.`,
      });
      return;
    }

    if (scope) {
      expect(String(scope), `${device()}: the worker is not registered at the site root`).toMatch(/\/$/);
      return;
    }

    // NO REGISTRATION -- AND ON A LOCAL ORIGIN THAT IS THE DESIGN, NOT A BUG.
    //
    // ServiceWorkerRegistration.tsx returns early unless
    // `window.location.origin` is the canonical origin, and the reason is in
    // the file: a worker registered against localhost would serve cached
    // responses back to `pages:serve` and to these very suites, so a run could
    // be testing the previous build with no signal that it had happened.
    //
    // So this is the honest shape of the assertion. Everything that CAN be
    // proven locally is proven above -- the worker is served, at the right
    // media type, from the surface that ships it. The activation itself can
    // only be proven on the canonical origin, and rather than pass quietly the
    // test insists the origin really is the reason, and records the limit.
    const canonicalOrigin = await page
      .request.get("/sitemap.xml")
      .then(async (response) => {
        const match = /<loc>(https?:\/\/[^/<]+)/.exec(await response.text());
        return match ? match[1] : null;
      })
      .catch(() => null);
    const origin = new URL(page.url()).origin;

    expect(
      canonicalOrigin,
      `${device()}: no canonical origin in the sitemap, so this test cannot tell a deliberate skip from a broken worker`,
    ).not.toBeNull();
    expect(
      origin,
      `${device()}: no service worker registered, and this IS the canonical origin -- so nothing explains it. ` +
        "The app cannot work offline once installed.",
    ).not.toBe(canonicalOrigin);

    test.info().annotations.push({
      type: "origin-limit",
      description:
        `${device()}: /sw.js is served here, but ServiceWorkerRegistration.tsx registers only on ${canonicalOrigin} ` +
        `and this run is on ${origin}, on purpose -- a worker on a test origin would serve the previous build back ` +
        "to the suite. Activation is therefore only observable on the canonical origin.",
    });
  });

  test("the installed app renders the same header as the tab", async ({ page, context, browserName }) => {
    // WHAT CAN AND CANNOT BE EMULATED, PLAINLY.
    //
    // No engine Playwright drives can emulate `(display-mode: standalone)`.
    // WebKit and Firefox expose no mechanism at all. Chromium accepts
    // Emulation.setEmulatedMedia with a display-mode feature over CDP and then
    // IGNORES it -- measured here, not assumed: the call succeeds and
    // matchMedia("(display-mode: standalone)") still reports false. The media
    // feature is computed from the real browsing context's display mode, and
    // there is no headless equivalent of "launched from the home screen".
    //
    // So this test does not pretend. It tries the emulation; if it takes, it
    // re-runs the load-bearing half of the iPhone gate under it. If it does
    // not, it proves the thing that makes the emulation unnecessary: that
    // NOTHING in the shipped CSS branches on display-mode, so the installed
    // app and the browser tab are the same rendering, and every other test in
    // this file already covers it. The day someone adds a standalone-only
    // rule, that assertion fires and says the installed surface has become
    // untested -- which is the honest alarm, and better than a green tick that
    // measured nothing.
    await page.goto("/", { waitUntil: "domcontentloaded" });

    let emulated = false;
    if (browserName === "chromium") {
      const session = await context.newCDPSession(page);
      await session
        .send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] })
        .catch(() => undefined);
      emulated = await page.evaluate(() => matchMedia("(display-mode: standalone)").matches);
      if (!emulated) await session.detach();
    }

    test.info().annotations.push({
      type: "display-mode",
      description: emulated
        ? `${device()}: (display-mode: standalone) emulated over CDP; the header was re-checked under it.`
        : `${device()}: (display-mode: standalone) CANNOT be emulated in ${browserName} under Playwright. ` +
          "Falling back to proving no shipped rule branches on display-mode, so the installed rendering is the tab rendering.",
    });

    if (emulated) {
      await press(page.locator(PROFILE_TRIGGER));
      await expect(
        page.locator(PROFILE_PANEL),
        `${device()}: installed, the profile panel did not open`,
      ).toBeVisible();
      expect(
        await clippingAncestors(page, PROFILE_PANEL),
        `${device()}: installed, the profile menu is clipped by an ancestor`,
      ).toEqual([]);
      const measured = await horizontalOverflow(page);
      expect(
        measured.scrollWidth,
        `${device()}: installed, the page scrolls sideways [${measured.culprits.join("; ")}]`,
      ).toBeLessThanOrEqual(measured.clientWidth + 1);
      return;
    }

    // The fallback assertion. Read the CSSOM rather than getComputedStyle: a
    // computed style cannot tell you a rule you never matched exists.
    const branches = await page.evaluate(() => {
      const collected: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSMediaRule && /display-mode/.test(rule.conditionText)) {
            collected.push(`@media ${rule.conditionText}`);
          }
          if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules);
        } catch {
          // A cross-origin sheet cannot be read; none of ours are.
        }
      }
      return collected;
    });

    expect(
      branches,
      `${device()}: the stylesheet now branches on display-mode:\n  ${branches.join("\n  ")}\n` +
        "No engine under Playwright can emulate (display-mode: standalone), so the moment a rule depends on it " +
        "the installed app stops being covered by this suite. Prove that rule on a real installed app, or drop it.",
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. The widths BETWEEN the breakpoints, in every engine.
//
// A matrix of devices steps over gaps. 761-960 is a gap that no stock phone
// profile and no desktop width lands in by accident, and it is where
// `.site-header nav { overflow-x: auto }` lives. This sweep walks it in all
// three engines from one project each, which is far cheaper than three more
// device rows per width.
// ---------------------------------------------------------------------------

test.describe("across every width", () => {
  test.skip(() => !sweeps(), "one sweeping project per engine is enough; the others have fixed viewports");
  test.describe.configure({ timeout: 180_000 });

  test("nothing clips either header panel at any width", async ({ page }) => {
    const offenders: string[] = [];

    for (const width of SWEEP_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(120);

      for (const [label, triggerSelector, panelSelector, container] of [
        ["profile", PROFILE_TRIGGER, PROFILE_PANEL, ".site-header"],
        ["About", ABOUT_TRIGGER, ABOUT_PANEL, "#primary-navigation"],
      ] as const) {
        if (label === "About") await revealNav(page);
        await press(page.locator(triggerSelector));
        await expect(page.locator(panelSelector)).toBeVisible();

        const hang = await overhang(page, panelSelector, container);
        if (!(hang > 0)) {
          offenders.push(
            `${width}px ${label}: the panel no longer hangs below ${container} (${hang}px) -- this gate is vacuous here`,
          );
        }
        const clippers = await clippingAncestors(page, panelSelector);
        if (clippers.length > 0) {
          const band =
            width >= NAV_SCROLL_BAND.from && width <= NAV_SCROLL_BAND.to
              ? ` [inside the ${NAV_SCROLL_BAND.from}-${NAV_SCROLL_BAND.to}px nav-scroll band]`
              : "";
          offenders.push(`${width}px ${label}${band}: ${clippers.join(", ")}`);
        }
        await page.keyboard.press("Escape");
      }
    }

    expect(
      offenders,
      `${device()}: header panels clipped by an ancestor:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  test("the document never scrolls sideways at any width", async ({ page }) => {
    const offenders: string[] = [];

    for (const width of SWEEP_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/learn/", "/guide/"]) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(120);
        const measured = await horizontalOverflow(page);
        if (measured.scrollWidth > measured.clientWidth + 1) {
          offenders.push(
            `${width}px ${route}: scrollWidth ${measured.scrollWidth} > clientWidth ${measured.clientWidth} [${measured.culprits.join("; ")}]`,
          );
        }
      }
    }

    expect(offenders, `${device()}: sideways scroll:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  test("both header menus open at any width", async ({ page }) => {
    const offenders: string[] = [];

    for (const width of SWEEP_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(120);

      await press(page.locator(PROFILE_TRIGGER));
      if (!(await page.locator(PROFILE_PANEL).isVisible())) offenders.push(`${width}px: the profile panel stayed shut`);
      const profileHit = await whatIsUnder(page, PROFILE_PANEL, PROFILE_PROTECTED_ROUTE);
      if (profileHit !== "hit") {
        offenders.push(`${width}px profile: the ${PROFILE_PROTECTED_ROUTE} entry is covered by ${profileHit}`);
      }
      await page.keyboard.press("Escape");

      await revealNav(page);
      await press(page.locator(ABOUT_TRIGGER));
      if (!(await page.locator(ABOUT_PANEL).isVisible())) offenders.push(`${width}px: the About panel stayed shut`);
      const aboutHit = await whatIsUnder(page, ABOUT_PANEL, ABOUT_ROUTE);
      if (aboutHit !== "hit") {
        const band =
          width >= NAV_SCROLL_BAND.from && width <= NAV_SCROLL_BAND.to
            ? ` [inside the ${NAV_SCROLL_BAND.from}-${NAV_SCROLL_BAND.to}px nav-scroll band]`
            : "";
        offenders.push(`${width}px About${band}: the ${ABOUT_ROUTE} entry is covered by ${aboutHit}`);
      }
      await page.keyboard.press("Escape");
    }

    expect(offenders, `${device()}: header menus that do not open:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});

// A matrix project's name carries its engine, and `sweeps()` reads the name to
// decide who owns the width sweep -- so a row renamed out of that shape would
// quietly stop sweeping. Check the shape, but only for rows that are IN the
// matrix: playwright.pages.config.ts runs part of this file under
// "pages-installed-app", which is not a device and has no engine in its name.
test.beforeAll(() => {
  const row = DEVICE_MATRIX.find((entry) => entry.name === device());
  if (!row) return;
  expect(
    ["chromium", "webkit", "firefox"],
    `the device-matrix project "${device()}" does not start with its engine`,
  ).toContain(engine());
  expect(row.engine, `${device()} names one engine and runs another`).toBe(engine());
});

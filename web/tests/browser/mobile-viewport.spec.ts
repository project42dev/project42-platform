import { devices, expect, test, type Page } from "@playwright/test";

// THE PHONE GATE.
//
// The portal shipped for months with a manifest, a service worker, an
// apple-mobile-web-app-capable tag and viewport-fit=cover, and was still not
// usable on an iPhone. The tags were never the problem. What was measurable on
// a real iPhone SE profile in WebKit:
//
//   * document.scrollWidth 344 against a 320px viewport on a module page,
//     because every heading family is sized with a clamp() whose FLOOR is a
//     desktop size -- clamp(3.4rem, 7vw, 7.3rem) cannot resolve below 54.4px,
//     so a phone always gets 54px headings and the last word ran off the edge
//   * nine footer links per page at 23.2px tall, the Field Guide's only card
//     action ("Open") at 45x18px, module citations at 19px
//   * the primary nav wrapped into a two-column block that occupied ~330 of
//     the 568 visible pixels, so you landed on the site and saw navigation
//
// This suite is the ratchet on all three. It runs under WebKit on an iPhone SE
// -- the tightest viewport of the supported set, and the engine Mobile Safari
// actually uses -- from the "mobile-webkit" project in playwright.config.ts.
// The chromium project ignores this file and this project ignores every other
// spec, so the desktop suites never run at 320px and this one never runs at
// 1280px, where it would pass without proving anything.

const MIN_TAP = 44;

// Routes a reader actually walks. The two content routes are discovered rather
// than hardcoded so a curriculum change cannot silently stop exercising the
// module template, which is where the overflow lived.
const STATIC_ROUTES = ["/", "/learn/", "/learn/paths/", "/guide/", "/ondemand/", "/support/"];

interface Offender {
  readonly label: string;
  readonly detail: string;
}

// Pick the WORST case rather than the first one: the module whose title holds
// the longest unbreakable word. A 54px heading only runs off the screen when a
// single word is wider than the column, so testing whichever module happens to
// be listed first ("What AI does") would pass while
// "Model Context Protocol (MCP) Architecture" -- the page that actually broke
// -- still overflowed.
function longestWord(text: string): number {
  return Math.max(0, ...text.split(/\s+/).map((word) => word.length));
}

// The sitemap is the whole catalogue in one request, and a module slug is its
// title in kebab case -- so the longest hyphen-separated segment across every
// slug identifies the longest word any heading will have to fit, without
// crawling 94 modules. Crawling one path's links instead picked
// "Context, Tokens, and Modalities" (longest word 10) and missed
// "Model Context Protocol (MCP) Architecture" (12), which is the page that
// actually ran off the screen.
async function discoverContentRoutes(page: import("@playwright/test").Page): Promise<string[]> {
  const response = await page.request.get("/sitemap.xml");
  if (!response.ok()) return ["/learn/paths/"];
  const routes = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].replace(/^https?:\/\/[^/]+/, ""))
    .filter((route) => /^\/learn\/[^/]+\/[^/]+\/$/.test(route));
  if (routes.length === 0) return ["/learn/paths/"];

  const worst = routes
    .map((route) => ({ route, weight: longestWord(route.split("/").filter(Boolean).at(-1)!.replace(/-/g, " ")) }))
    .sort((left, right) => right.weight - left.weight)[0];
  const pathRoute = `/${worst.route.split("/").filter(Boolean)[0]}/${worst.route.split("/").filter(Boolean)[1]}/`;
  return [pathRoute, worst.route];
}

test.describe("phone viewport", () => {
  test("no route scrolls the page sideways", async ({ page }) => {
    const routes = [...STATIC_ROUTES, ...(await discoverContentRoutes(page))];
    const overflowing: string[] = [];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(250);
      const measured = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const widest: string[] = [];
        for (const element of document.querySelectorAll<HTMLElement>("body *")) {
          // An element inside its own scroll container is allowed to be wider
          // than the screen -- that is what a scrollable table or code block
          // is. Only a box that pushes the PAGE counts.
          if (element.getBoundingClientRect().right <= viewport + 1) continue;
          let clipped = false;
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const overflowX = getComputedStyle(parent).overflowX;
            if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden" || overflowX === "clip") {
              clipped = true;
              break;
            }
          }
          if (!clipped) {
            widest.push(
              `${element.tagName.toLowerCase()}.${String(element.className).trim().split(/\s+/).slice(0, 2).join(".")} right=${Math.round(element.getBoundingClientRect().right)}`,
            );
          }
        }
        // A heading whose own content is wider than its box is the shape of
        // this defect BEFORE it reaches the page: it is what a clamp() floor
        // sized for a desktop does to a phone column. Catch it directly, since
        // an ancestor with overflow:hidden can swallow the page-level symptom
        // while the last word is still clipped off the screen.
        const clippedHeadings: string[] = [];
        for (const heading of document.querySelectorAll<HTMLElement>("h1, h2, h3")) {
          if (getComputedStyle(heading).overflowX !== "visible") continue;
          if (heading.scrollWidth > heading.clientWidth + 1) {
            clippedHeadings.push(
              `<${heading.tagName.toLowerCase()}> "${(heading.textContent ?? "").trim().slice(0, 40)}" content ${heading.scrollWidth}px in a ${heading.clientWidth}px box at ${getComputedStyle(heading).fontSize}`,
            );
          }
        }
        return {
          viewport,
          scrollWidth: document.documentElement.scrollWidth,
          widest: widest.slice(0, 5),
          clippedHeadings,
        };
      });
      if (measured.scrollWidth > measured.viewport + 1) {
        overflowing.push(
          `${route}: scrollWidth ${measured.scrollWidth} > viewport ${measured.viewport} [${measured.widest.join("; ")}]`,
        );
      }
      for (const heading of measured.clippedHeadings) {
        overflowing.push(`${route}: ${heading}`);
      }
    }

    expect(overflowing, `content wider than the phone screen:\n${overflowing.join("\n")}`).toEqual([]);
  });

  test("every control a phone has to hit is at least 44x44", async ({ page }) => {
    const routes = [...STATIC_ROUTES, ...(await discoverContentRoutes(page))];
    const offenders: Offender[] = [];

    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(250);
      const found = await page.evaluate((minimum) => {
        const results: { label: string; detail: string }[] = [];
        const selector = "a, button, [role=button], summary, input, select, textarea";
        for (const element of document.querySelectorAll<HTMLElement>(selector)) {
          const styles = getComputedStyle(element);
          // A citation or a link inside a sentence reflows with the prose. WCAG
          // 2.5.8 exempts those, and requiring 44px on them would either break
          // the paragraph or make the gate useless by being suppressed.
          if (styles.display === "inline") continue;

          // A checkbox or radio inside a <label> is not the tap target -- the
          // label is, and iOS forwards the tap. Measuring the raw <input>
          // flags every native control on the site forever.
          let target: HTMLElement = element;
          if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
            const wrapping = element.closest("label");
            const associated = element.id
              ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(element.id)}"]`)
              : null;
            const label = wrapping ?? associated;
            if (!label) {
              results.push({ label: "input", detail: `${element.type} has no label to tap` });
              continue;
            }
            target = label;
          }

          const box = target.getBoundingClientRect();
          // Off-screen affordances (the skip link parks at top:-80px) and
          // anything a rule has hidden are not tappable and not defects.
          if (box.width === 0 || box.height === 0) continue;
          if (box.bottom < 0 || box.right < 0) continue;
          if (styles.visibility === "hidden") continue;

          if (box.width < minimum || box.height < minimum) {
            const name =
              (target.textContent ?? "").trim().slice(0, 32) ||
              target.getAttribute("aria-label") ||
              target.tagName.toLowerCase();
            results.push({
              label: `${target.tagName.toLowerCase()}.${String(target.className).trim().split(/\s+/).slice(0, 2).join(".")}`,
              detail: `"${name}" is ${box.width.toFixed(1)}x${box.height.toFixed(1)}`,
            });
          }
        }
        return results;
      }, MIN_TAP);

      for (const item of found) offenders.push({ label: `${route} ${item.label}`, detail: item.detail });
    }

    expect(
      offenders,
      `controls under ${MIN_TAP}x${MIN_TAP} CSS px on a phone:\n${offenders.map((o) => `  ${o.label} -- ${o.detail}`).join("\n")}`,
    ).toEqual([]);
  });

  test("the edges viewport-fit=cover exposes are padded", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // env(safe-area-inset-*) resolves to 0px in EVERY engine under Playwright:
    // there is no notch to emulate, so a computed-style check would pass on a
    // page with no safe-area handling at all and prove nothing. The only
    // honest check available here is the CSSOM -- does a rule for the pinned
    // element name the inset. Do not "fix" this into a getComputedStyle call.
    const declarations = await page.evaluate(() => {
      const collected: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) collected.push(`${rule.selectorText}{${rule.style.cssText}}`);
          else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
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

    const has = (selector: string, inset: string) =>
      declarations.some((rule) => rule.startsWith(`${selector}{`) && rule.includes(`safe-area-inset-${inset}`));

    expect(has(".site-header", "top"), ".site-header does not pad the notch inset").toBe(true);
    expect(has(".site-footer", "bottom"), ".site-footer does not pad the home-indicator inset").toBe(true);
    expect(
      declarations.some((rule) => rule.includes("safe-area-inset-left")),
      "no rule pads the landscape left inset",
    ).toBe(true);
    expect(
      declarations.some((rule) => rule.includes("safe-area-inset-right")),
      "no rule pads the landscape right inset",
    ).toBe(true);
  });

  test("the primary navigation is a one-handed disclosure, not a wall", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const toggle = page.locator(".nav-toggle");
    const nav = page.locator("#primary-navigation");

    await expect(toggle, "no navigation disclosure at phone width").toBeVisible();
    const box = await toggle.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN_TAP);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TAP);

    // Closed by default: the reader sees the page, not the site map.
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(nav).toBeVisible();

    // Every destination is still in the served HTML whether the panel is open
    // or shut -- the link checker and the Pages export read that, not the
    // rendered box -- so hiding is CSS, never conditional rendering.
    await expect(page.locator("#primary-navigation > a")).not.toHaveCount(0);

    // The call to action used to be display:none on every phone.
    await expect(page.locator(".nav-cta")).toBeVisible();
  });

  test("no text input is small enough to make iOS zoom on focus", async ({ page }) => {
    const offenders: string[] = [];
    for (const route of [...STATIC_ROUTES, "/account/"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(250);
      // Safari zooms the whole page when a field under 16px takes focus, and
      // never zooms back out. Radios and checkboxes do not take text focus and
      // are not affected.
      const small = await page.evaluate(() => {
        const results: string[] = [];
        for (const field of document.querySelectorAll<HTMLElement>("input, select, textarea")) {
          if (field instanceof HTMLInputElement && ["checkbox", "radio", "submit", "button", "hidden"].includes(field.type)) continue;
          const box = field.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          const size = Number.parseFloat(getComputedStyle(field).fontSize);
          if (size < 16) results.push(`${field.tagName.toLowerCase()} at ${size}px`);
        }
        return results;
      });
      for (const item of small) offenders.push(`${route}: ${item}`);
    }
    expect(offenders, `fields that trigger iOS focus zoom:\n${offenders.join("\n")}`).toEqual([]);
  });
});

// THE PROFILE DISCLOSURE ON A PHONE.
//
// The profile control in the header did nothing on an iPhone: you tapped it and
// no menu appeared, in Mobile Safari and in the installed app alike, while the
// same build worked on a desktop browser. The disclosure was never at fault --
// `aria-expanded` flipped, the panel lost `hidden`, and its box was laid out on
// screen. What was wrong is that the panel was laid out inside a CLIPPING
// ANCESTOR:
//
//   .site-header { overflow-x: clip }
//
// and the panel is absolutely positioned at `top: calc(100% + 0.35rem)`, i.e.
// deliberately hanging BELOW the header it lives in. Per CSS Overflow, `clip` on
// one axis must clip that axis only; Chromium and Gecko implement that, which is
// why the menu worked on a desktop. WebKit does not: a single-axis `clip` is
// reported in the field to clip BOTH axes in Safari, so on iOS the panel was cut
// off flush with the bottom edge of the header -- a menu that opens and is
// instantly invisible. The declaration bought nothing measurable either: with it
// removed, document.scrollWidth still equals the viewport at every width from
// 320 to 1440, on every route the suite walks.
//
// The behavioural halves of this gate (tap, hit-test, navigate, keyboard) pass
// on the broken code too, because Playwright's WebKit build honours single-axis
// clip correctly -- exactly the gap that let this ship. The load-bearing test is
// therefore the CLIPPING-ANCESTOR one, in the same spirit as the safe-area test
// above: when an engine difference is not reproducible here, gate the CSS that
// the engine difference acts on. The rule it encodes is not Safari trivia -- a
// panel that is positioned outside its container must not have an ancestor that
// clips in ANY axis -- so it is worth holding regardless of who is right.
//
// On the installed app specifically: no rule in globals.css and no component
// branches on `(display-mode: standalone)`, and WebKit under Playwright cannot
// emulate that media feature at all. The installed app therefore differs from a
// Safari tab only in the browser chrome and in the safe-area insets, and both of
// those are already covered -- the insets by the CSSOM test above, the viewport
// by running this file on the two iPhone profiles below.

const PROFILE_TRIGGER = ".header-actions .header-menu-trigger";
const PROFILE_PANEL = ".header-actions .header-menu-panel";

/** Every ancestor of the profile panel that clips in either axis. */
async function clippingAncestors(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const panel = document.querySelector<HTMLElement>(selector);
    if (!panel) return ["no profile panel in the document"];
    const found: string[] = [];
    for (let ancestor = panel.parentElement; ancestor; ancestor = ancestor.parentElement) {
      // <html> and <body> are exempt. Clipping the document is the SUPPORTED
      // way to stop a sideways scroll, and it cannot hide this panel: the
      // document is taller than the header by the whole page.
      if (ancestor === document.documentElement || ancestor === document.body) continue;
      const styles = getComputedStyle(ancestor);
      if (styles.overflowX === "visible" && styles.overflowY === "visible") continue;
      const name = `${ancestor.tagName.toLowerCase()}${String(ancestor.className).trim() ? `.${String(ancestor.className).trim().split(/\s+/)[0]}` : ""}`;
      found.push(`${name} {overflow-x: ${styles.overflowX}; overflow-y: ${styles.overflowY}}`);
    }
    return found;
  }, PROFILE_PANEL);
}

function profileMenuContract(deviceLabel: string): void {
  test(`${deviceLabel}: a tap opens the profile menu and its destinations are hit-testable`, async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const trigger = page.locator(PROFILE_TRIGGER);
    const panel = page.locator(PROFILE_PANEL);

    // Shut on arrival, and every destination already in the served HTML -- the
    // link checker and the Pages export read that, not the rendered box.
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(panel.locator("a")).not.toHaveCount(0);

    // A real tap: touchstart/touchend and the click iOS synthesises from them,
    // not an element.click(). The document-level dismissal listeners this
    // component installs are touch listeners, so a synthetic click would not
    // exercise them.
    await trigger.tap();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();

    // Visible is not the same as reachable. A trial tap runs the whole
    // actionability check -- including the hit test that fails naming whatever
    // intercepts the point -- without following the link. "My progress" is a
    // protected route, and following it signed out hands the browser to the
    // identity provider, which is not this test's business.
    await panel.getByRole("link", { name: "My progress" }).tap({ trial: true });
    const underThePoint = await page.evaluate((selector) => {
      const link = [...document.querySelectorAll<HTMLAnchorElement>(`${selector} a`)].find(
        (candidate) => candidate.textContent?.trim() === "My progress",
      );
      if (!link) return "no My progress link";
      const box = link.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === link ? "My progress" : `${hit?.tagName.toLowerCase()}.${String(hit?.className ?? "").trim()}`;
    }, PROFILE_PANEL);
    expect(underThePoint, "something else is on top of the menu entry").toBe("My progress");

    // Then a real tap, on the public destination in the same panel: the touch
    // lands, the link navigates, and the panel's own click handler does not
    // swallow it on the way.
    await panel.getByRole("link", { name: "Account", exact: true }).tap();
    await expect(page).toHaveURL(/\/account\/?$/);
  });

  test(`${deviceLabel}: nothing between the profile panel and the page clips it`, async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator(PROFILE_TRIGGER).tap();
    await expect(page.locator(PROFILE_PANEL)).toBeVisible();

    // The gate is only worth anything if the panel genuinely hangs outside the
    // header. Measure that first, so a future layout change that tucks the
    // panel inside cannot quietly make this test vacuous.
    const overhang = await page.evaluate((selector) => {
      const panel = document.querySelector<HTMLElement>(selector)!;
      const header = panel.closest(".site-header")!;
      return panel.getBoundingClientRect().bottom - header.getBoundingClientRect().bottom;
    }, PROFILE_PANEL);
    expect(overhang, "the profile panel no longer hangs below the header").toBeGreaterThan(0);

    const clippers = await clippingAncestors(page);
    expect(
      clippers,
      `the profile menu hangs ${Math.round(overhang)}px below the header, and these ancestors clip it:\n  ${clippers.join("\n  ")}\nSafari clips BOTH axes when either is clip/hidden, so on an iPhone this menu opens invisible. Clip somewhere that does not contain the panel.`,
    ).toEqual([]);
  });

  test(`${deviceLabel}: the keyboard contract survives`, async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const trigger = page.locator(PROFILE_TRIGGER);
    const panel = page.locator(PROFILE_PANEL);

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();

    // Escape closes AND puts focus back on the trigger, or a keyboard user is
    // dropped at the top of the document.
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

// The tightest supported viewport, inherited from the mobile-webkit project.
test.describe("the profile menu on a phone", () => {
  profileMenuContract("iPhone SE");
});

// A notch-class handset -- the shape most people actually hold, and the one the
// defect was reported on. Same engine, 390x664 rather than 320x568.
//
// The descriptor's fields are taken one by one rather than spread: Playwright
// refuses `defaultBrowserType` inside a describe because it would force a new
// worker, and the engine is already WebKit here -- this project runs nothing
// else.
const { deviceScaleFactor, hasTouch, isMobile, userAgent, viewport } = devices["iPhone 14"];

test.describe("the profile menu on a notch-class iPhone", () => {
  test.use({ deviceScaleFactor, hasTouch, isMobile, userAgent, viewport });
  profileMenuContract("iPhone 14");
});

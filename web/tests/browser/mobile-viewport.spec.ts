import { expect, test } from "@playwright/test";

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

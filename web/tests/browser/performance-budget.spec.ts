import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// The byte side of the budget is enforced deterministically off the build
// output by scripts/performance-budget.mjs. This covers the part that only a
// browser can see: that the home route actually paints, and does so well
// inside the Core Web Vitals "poor" boundary. Thresholds and the reasoning
// behind them live in config/performance-budget.json so a number can never be
// changed without saying why.
interface VitalBudget {
  id: string;
  label: string;
  limit: number;
  reasoning: string;
}

const budget = JSON.parse(
  readFileSync(resolve(process.cwd(), "config/performance-budget.json"), "utf8"),
) as { vitals: VitalBudget[] };

const homeLcp = budget.vitals.find((entry) => entry.id === "home-lcp-ms");

test("paints the home route inside the largest-contentful-paint budget", async ({
  page,
}) => {
  expect(homeLcp, "config/performance-budget.json must declare home-lcp-ms").toBeTruthy();

  await page.goto("/");
  // The entry is buffered, so this resolves even though the paint already
  // happened before the observer was installed.
  const largestContentfulPaint = await page.evaluate(
    () =>
      new Promise<number>((resolvePaint) => {
        let latest = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            latest = Math.max(latest, entry.startTime);
          }
        });
        observer.observe({ type: "largest-contentful-paint", buffered: true });
        // Give late-arriving entries (fonts, hero imagery) a moment to land.
        setTimeout(() => {
          observer.disconnect();
          resolvePaint(latest);
        }, 1_000);
      }),
  );

  expect(largestContentfulPaint).toBeGreaterThan(0);
  expect(
    largestContentfulPaint,
    `${homeLcp!.label} exceeded its budget. ${homeLcp!.reasoning}`,
  ).toBeLessThanOrEqual(homeLcp!.limit);
});

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PROJECT42_PLAYWRIGHT_PORT ?? "48142");
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("PROJECT42_PLAYWRIGHT_PORT must be an integer from 1024 to 65535.");
}
const serverOrigin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: process.env.CI ? 120_000 : 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: serverOrigin,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // The phone gate belongs to the mobile-webkit project below. Run at
      // 1280px it would pass without measuring anything it exists to measure.
      testIgnore: /mobile-viewport/,
      // WHAT THIS PROJECT IS FOR, and what it costs.
      //
      // Every other spec in tests/browser runs here, against the exported
      // bytes rather than the server that produced them. That is deliberate:
      // the export is not a copy of the application. It rewrites hrefs, adds a
      // click handler that turns every in-site link into a full document load,
      // retires the Admin routes, and serves directories rather than routes.
      // A regression in any of those breaks the published site and nothing the
      // live-server suite runs would see it.
      //
      // The price is that a spec written for a running application can assert
      // something the artifact cannot have. That is a defect in the SPEC, not
      // a reason to scope this project down to a list -- a list stops covering
      // whatever is written next, silently. A spec that needs a live server
      // probes the surface it was handed and skips with the reason stated
      // (tests/browser/support/surface.ts, and device-matrix.spec.ts over
      // /sw.js), so it still runs where the server exists and says out loud
      // why it did not run here.
    },
    {
      // Mobile Safari's engine, on the tightest supported viewport. Every other
      // spec is tuned for a desktop width and would fail here for reasons that
      // have nothing to do with the phone, so this project runs one file.
      name: "mobile-webkit",
      use: { ...devices["iPhone SE"] },
      testMatch: /mobile-viewport/,
    },
    {
      // THE INSTALLED-APP SURFACE, on the artifact that is actually installed.
      //
      // The service worker is a file the Pages export writes, not a route the
      // application serves, so `npm run test:browser` -- which drives the
      // vinext server -- has no worker to register and skips that assertion
      // saying so. This project is where it is proven: the same describe
      // block, against the exported bytes this repository publishes.
      //
      // One engine is enough here. What is being measured is what the artifact
      // contains -- the manifest, its icons, start_url and /sw.js -- and that
      // is identical whichever browser asks for it. The per-device behaviour
      // is the device matrix's job, against the live application.
      name: "pages-installed-app",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /device-matrix/,
      grep: /the installed app/,
    },
  ],
  webServer: {
    command: `node scripts/serve-github-pages.mjs --port ${port}`,
    url: serverOrigin,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

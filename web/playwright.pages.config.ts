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

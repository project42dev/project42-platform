import { defineConfig, devices } from "@playwright/test";
import { DEVICE_MATRIX } from "./tests/browser/support/devices";

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
      // The device matrix owns its own projects for the same reason: one more
      // pass of it at 1280px in Chromium proves nothing the matrix has not
      // already proved on nine other profiles.
      testIgnore: /mobile-viewport|device-matrix/,
    },
    {
      // Mobile Safari's engine, on the tightest supported viewport. Every other
      // spec is tuned for a desktop width and would fail here for reasons that
      // have nothing to do with the phone, so this project runs one file.
      name: "mobile-webkit",
      use: { ...devices["iPhone SE"] },
      testMatch: /mobile-viewport/,
    },
    // THE DEVICE MATRIX.
    //
    // One project per row of tests/browser/support/devices.ts, each running
    // device-matrix.spec.ts and nothing else -- the other suites are written
    // for a desktop width and would fail on a phone for reasons that have
    // nothing to do with the phone.
    //
    // The project NAME is the device name the spec puts in every failure, so
    // `npx playwright test --project webkit-ipad-portrait` reruns exactly the
    // thing that broke.
    //
    // PROJECT42_DEVICE_MATRIX=off drops the matrix for a local iteration loop
    // on one of the other suites. It is deliberately opt-OUT: a matrix you
    // have to remember to switch on is a matrix that stops running.
    ...(process.env.PROJECT42_DEVICE_MATRIX === "off"
      ? []
      : DEVICE_MATRIX.map((entry) => ({
          name: entry.name,
          // `browserName` rather than a descriptor's `defaultBrowserType`: the
          // table strips that field so a row can state its engine once, and a
          // Firefox row has no descriptor to take it from at all.
          use: { browserName: entry.engine, ...entry.use },
          // The resume journey joins the matrix rather than staying on the
          // desktop project alone. It is written to assert on names and roles
          // rather than on a layout, so it passes at any width -- and resume is
          // exactly the kind of feature that breaks on a phone and nowhere
          // else, because it depends on localStorage surviving a reload in a
          // browser that partitions and evicts storage far more aggressively
          // than a desktop one does. PROJECT42_DEVICE_MATRIX=off drops both.
          testMatch: /device-matrix|resume-where-you-left-off/,
          // The width sweep resizes the viewport, so it belongs to one project
          // per engine and would be a no-op everywhere else. Filtering it out
          // here rather than skipping it inside the spec keeps 45 "skipped"
          // lines -- which mean nothing -- out of every run summary. The skips
          // that remain are the ones that carry a reason worth reading.
          ...(entry.sweepsWidths ? {} : { grepInvert: /across every width/ }),
        }))),
  ],
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: serverOrigin,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

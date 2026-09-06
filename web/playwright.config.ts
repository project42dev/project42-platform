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
    },
  ],
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: serverOrigin,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

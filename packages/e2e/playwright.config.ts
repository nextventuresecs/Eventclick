import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
  ],
  globalSetup: "./utils/global-setup.ts",
  globalTeardown: "./utils/global-teardown.ts",
  use: {
    baseURL,
    storageState: ".auth/admin.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
      },
    },
  ],
  webServer: {
        command: "npm run dev",
        cwd: "../../",
        url: `${process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:4000"}/api/v1/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});

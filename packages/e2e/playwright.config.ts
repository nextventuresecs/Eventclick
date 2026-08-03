import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: false,
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
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  expect: {
    timeout: 15000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "authenticated",
      dependencies: ["setup"],
      use: {
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
          ],
        },
      },
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: [
    {
      command: "npm run dev --workspace=server",
      cwd: "../../",
      url: `${process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:4000"}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: "npm run dev --workspace=client",
      cwd: "../../",
      url: `${process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000"}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});

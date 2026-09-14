import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import {
  E2E_MAINTAINER_EMAIL,
  E2E_NON_MAINTAINER_EMAIL,
  OPS_BASE_URL,
  OPS_NON_MAINTAINER_BASE_URL,
} from "./utils/ops";

dotenv.config({ path: path.resolve(__dirname, ".env") });
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

// Ops Console (#147): ops-server connects as the maintainer login roles on the
// same database, with the dev-default passwords init-db.sql sets when none are
// configured (CI sets none).
const opsDatabaseUrl = (user: string, password: string): string => {
  const u = new URL(
    process.env.DATABASE_URL ||
      process.env.PLAYWRIGHT_DATABASE_URL ||
      "postgresql://Eventclick_admin:1234@localhost:5433/Eventclick_db",
  );
  u.username = user;
  u.password = password;
  return u.toString();
};

const opsServerEnv = (bypassEmail: string, baseUrl: string): Record<string, string> => ({
  NODE_ENV: "test",
  OPS_PORT: new URL(baseUrl).port,
  OPS_AUTH_BYPASS_EMAIL: bypassEmail,
  OPS_STATIC_DIR: path.resolve(__dirname, "../ops/dist"),
  MAINTAINER_RO_DATABASE_URL: opsDatabaseUrl(
    "maintainer_ro_login",
    process.env.MAINTAINER_RO_DB_PASSWORD || "local_dev_maint_ro",
  ),
  MAINTAINER_AUDIT_DATABASE_URL: opsDatabaseUrl(
    "maintainer_audit_login",
    process.env.MAINTAINER_AUDIT_DB_PASSWORD || "local_dev_maint_audit",
  ),
});

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
      testIgnore: [/auth\.setup\.ts/, /ops-shell\.spec\.ts/],
    },
    {
      // No tenant login: ops-server authenticates through its own bypass.
      name: "ops",
      testMatch: /ops-shell\.spec\.ts/,
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
    {
      // Builds the Ops Console once; ops-server serves it from dist.
      command: "npm run build --workspace=@application/ops && npm run dev:ops --workspace=server",
      cwd: "../../",
      url: `${OPS_BASE_URL}/ops-api/v1/healthz`,
      env: opsServerEnv(E2E_MAINTAINER_EMAIL, OPS_BASE_URL),
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: "npm run dev:ops --workspace=server",
      cwd: "../../",
      url: `${OPS_NON_MAINTAINER_BASE_URL}/ops-api/v1/healthz`,
      env: opsServerEnv(E2E_NON_MAINTAINER_EMAIL, OPS_NON_MAINTAINER_BASE_URL),
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});

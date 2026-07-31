import { chromium } from "@playwright/test";
import { truncateAllTables } from "../utils/db";

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:4000";
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3000";
const ORIGIN = BASE_URL;

const authHeaders = {
  "Origin": ORIGIN,
  "Referer": ORIGIN,
};

export default async function globalSetup() {
  await truncateAllTables();

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  const email = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD || "Test123!@#";

  const registerRes = await page.request.post(`${API_BASE}/api/v1/auth/register`, {
    headers: authHeaders,
    data: {
      email,
      password,
      fullName: "E2E Admin",
      organizationName: "E2E Test Org",
    },
  });

  if (registerRes.ok()) {
    await page.request.post(`${API_BASE}/api/v1/auth/login`, {
      headers: authHeaders,
      data: { email, password },
    });
  } else {
    await page.request.post(`${API_BASE}/api/v1/auth/login`, {
      headers: authHeaders,
      data: { email, password },
    });
  }

  await context.storageState({ path: "packages/e2e/.auth/admin.json" });

  await browser.close();
}

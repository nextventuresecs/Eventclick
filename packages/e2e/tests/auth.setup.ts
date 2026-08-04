import { test as setup, expect } from "@playwright/test";
import { chromium } from "@playwright/test";
import { loginUser, saveTokens } from "../utils/api-helpers";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD!;
const volunteerEmail = process.env.PLAYWRIGHT_VOLUNTEER_EMAIL || "volunteer@test.com";
const volunteerPassword = process.env.PLAYWRIGHT_VOLUNTEER_PASSWORD!;

setup("authenticate admin and volunteer", async ({ request }) => {
  // Login admin
  const admin = await loginUser(request, adminEmail, adminPassword);
  expect(admin.accessToken).toBeTruthy();

  // Login volunteer
  const volunteer = await loginUser(request, volunteerEmail, volunteerPassword);
  expect(volunteer.accessToken).toBeTruthy();

  // Save access tokens for API helpers
  saveTokens({
    adminAccessToken: admin.accessToken,
    volunteerAccessToken: volunteer.accessToken,
  });

  const cookieDomain = new URL(BASE_URL).hostname;
  const browser = await chromium.launch();

  // Save admin storage state
  const adminCtx = await browser.newContext({ baseURL: BASE_URL });
  if (admin.refreshToken) {
    await adminCtx.addCookies([{
      name: "Eventclick_rt",
      value: admin.refreshToken,
      domain: cookieDomain,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
  }
  await adminCtx.storageState({ path: ".auth/admin.json" });
  await adminCtx.close();

  // Save volunteer storage state
  const volunteerCtx = await browser.newContext({ baseURL: BASE_URL });
  if (volunteer.refreshToken) {
    await volunteerCtx.addCookies([{
      name: "Eventclick_rt",
      value: volunteer.refreshToken,
      domain: cookieDomain,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    }]);
  }
  await volunteerCtx.storageState({ path: ".auth/volunteer.json" });
  await volunteerCtx.close();

  await browser.close();
});

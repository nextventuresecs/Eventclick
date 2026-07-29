import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.describe("Unauthenticated journeys", () => {
  test("home redirects to dashboard", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveURL(/\/login|\/dashboard/);
  });

  test("login page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator("h1, h2")).toContainText(/login|sign in/i);
  });

  test("register page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await expect(page.locator("h1, h2")).toContainText(/create account|register|sign up/i);
  });
});

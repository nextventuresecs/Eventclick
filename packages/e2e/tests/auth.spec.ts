import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3000";

test.describe("Unauthenticated journeys", () => {
  test("home redirects to dashboard", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveURL(/\/login|\/dashboard/);
  });

  test("login page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.getByRole("heading", { level: 2, name: /sign in/i })).toBeVisible();
  });

  test("register page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await expect(page.getByRole("heading", { level: 2, name: /create your account|register|sign up/i })).toBeVisible();
  });
});

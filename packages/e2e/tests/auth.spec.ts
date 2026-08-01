import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.describe("Unauthenticated journeys", () => {
  test("home redirects to dashboard", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveURL(/\/login|\/dashboard/);
  });

  test("login page loads", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto(BASE_URL);
    await expect(loginPage.heading).toBeVisible();
  });

  test("register page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await expect(page.getByRole("heading", { level: 2, name: /create your account|register|sign up/i })).toBeVisible();
  });
});

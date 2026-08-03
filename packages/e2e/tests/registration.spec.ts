import { test, expect } from "@playwright/test";
import { RegisterPage } from "../pages/RegisterPage";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.describe("Registration journey", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("register page loads with all form fields", async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto(BASE_URL);

    await expect(registerPage.heading).toBeVisible();
    await expect(registerPage.fullNameInput).toBeVisible();
    await expect(registerPage.emailInput).toBeVisible();
    await expect(registerPage.passwordInput).toBeVisible();
    await expect(registerPage.organizationNameInput).toBeVisible();
    await expect(registerPage.termsCheckbox).toBeVisible();
    await expect(registerPage.submitButton).toBeVisible();
  });

  test("Zod validation prevents submission with empty required fields", async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto(BASE_URL);

    await registerPage.submitButton.click();

    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/register`));
  });

  test("terms checkbox is required", async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto(BASE_URL);

    await registerPage.fullNameInput.fill("Test User");
    await registerPage.emailInput.fill("test@example.com");
    await registerPage.passwordInput.fill("Test123456");
    await registerPage.submitButton.click();

    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/register`));
  });
});

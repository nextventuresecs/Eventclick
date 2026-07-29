import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.describe("Public share link", () => {
  test("watch page loads without auth", async ({ page }) => {
    await page.goto(`${BASE_URL}/watch/test-token`);
    await expect(page.locator("body")).toBeVisible();
  });

  test("404 for invalid share token", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/watch/nonexistent-token-12345`);
    expect(response?.status()).toBe(404);
  });
});

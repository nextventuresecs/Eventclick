import { test, expect } from "@playwright/test";
import { SharePage } from "../pages/SharePage";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3000";

test.describe("Public share link", () => {
  test("watch page loads without auth", async ({ page }) => {
    const sharePage = new SharePage(page);
    await sharePage.goto(BASE_URL, "test-token");
    await expect(page.locator("body")).toBeVisible();
  });

  test("404 for invalid share token", async ({ page }) => {
    const sharePage = new SharePage(page);
    await sharePage.goto(BASE_URL, "nonexistent-token-12345");
    await expect(sharePage.notFoundHeading).toBeVisible({ timeout: 10000 });
  });
});

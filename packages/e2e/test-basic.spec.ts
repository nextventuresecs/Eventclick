import { test, expect } from "@playwright/test";
test("basic", async ({ page }) => {
  await page.goto("http://example.com");
  expect(await page.title()).toBe("Example Domain");
});

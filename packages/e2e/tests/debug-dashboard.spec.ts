import { test, expect } from "../fixtures";

test.use({ storageState: ".auth/admin.json" });

test("debug dashboard", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000/dashboard");
  await page.waitForTimeout(3000);

  console.log("URL:", page.url());
  console.log("Title:", await page.title());
  console.log("Body text:", await page.textContent("body"));

  const heading = page.getByRole("heading", { name: /welcome back/i });
  console.log("Heading count:", await heading.count());
});

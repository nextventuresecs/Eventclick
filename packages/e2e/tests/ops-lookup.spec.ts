import { test, expect } from "@playwright/test";
import { OPS_BASE_URL } from "../utils/ops";

// Seeded by utils/global-setup.ts for the tenant suites.
const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";

test.describe("Ops Console lookup", () => {
  test("search by email, view masked, unmask with a reason, and lose it on navigation", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (err) => problems.push(err.message));

    await page.goto(`${OPS_BASE_URL}/`);
    await expect(page.getByRole("heading", { name: "Session" })).toBeVisible();

    // Any case: stored emails are lowercase and search lowercases the term.
    await page.getByRole("searchbox").fill(adminEmail.toUpperCase());
    await page.getByRole("searchbox").press("Enter");

    await expect(page.getByText("1 exact match")).toBeVisible();
    await expect(page.getByText(adminEmail)).toHaveCount(0);
    await page.getByRole("link", { name: /\*\*\*@/ }).click();

    await expect(page.getByRole("heading", { name: "User" })).toBeVisible();
    await expect(page.getByText("This view is recorded.")).toBeVisible();
    await expect(page.getByText(adminEmail)).toHaveCount(0);

    await page.getByRole("button", { name: "Unmask" }).click();
    const confirm = page.getByRole("button", { name: "Confirm unmask" });
    await page.getByLabel("Reason").fill("too short");
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Reason").fill("E2E check: verifying unmask flow");
    await confirm.click();

    await expect(page.getByText(adminEmail)).toBeVisible();

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { name: "Session" })).toBeVisible();
    await page.goBack();

    await expect(page.getByRole("heading", { name: "User" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Unmask" })).toBeVisible();
    await expect(page.getByText(adminEmail)).toHaveCount(0);

    expect(problems).toEqual([]);
  });
});

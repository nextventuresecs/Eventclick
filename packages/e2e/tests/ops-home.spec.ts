import { test, expect } from "@playwright/test";
import { OPS_BASE_URL } from "../utils/ops";

// "E2E Test Org" is seeded by utils/global-setup.ts.
test.describe("Ops Console home", () => {
  test("shows the health strip and the usage table with the seeded org", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (err) => problems.push(err.message));

    await page.goto(`${OPS_BASE_URL}/`);

    const health = page.locator("section").filter({ has: page.getByRole("heading", { name: "Health" }) });
    await expect(health.getByRole("heading", { name: "Dependencies" })).toBeVisible();
    // Whatever state the dev tenant server is in, the app probe reaches it and lists its checks.
    await expect(health.getByRole("list", { name: "Dependency checks" }).getByText(/^database/)).toBeVisible();
    await expect(health.getByText("PDF jobs stuck >15m")).toBeVisible();
    await expect(health.getByText(/Healthy|Degraded|Unhealthy|Unknown/).first()).toBeVisible();

    const usage = page.locator("section").filter({ has: page.getByRole("heading", { name: "Usage" }) });
    const org = usage.getByRole("link", { name: "E2E Test Org" });
    await expect(org).toBeVisible();
    await org.click();
    await expect(page).toHaveURL(/\/orgs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "E2E Test Org" })).toBeVisible();

    expect(problems).toEqual([]);
  });
});

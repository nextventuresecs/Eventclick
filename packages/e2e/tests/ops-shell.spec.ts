import { test, expect } from "@playwright/test";
import { E2E_MAINTAINER_EMAIL, OPS_BASE_URL, OPS_NON_MAINTAINER_BASE_URL } from "../utils/ops";

test.describe("Ops Console shell", () => {
  test("a maintainer sees their session and the external tool links", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(msg.text());
    });
    page.on("pageerror", (err) => problems.push(err.message));

    await page.goto(`${OPS_BASE_URL}/`);

    await expect(page.getByRole("heading", { name: "Session" })).toBeVisible();
    await expect(page.getByText(E2E_MAINTAINER_EMAIL).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign out" })).toHaveAttribute("href", "/cdn-cgi/access/logout");

    for (const name of ["CloudWatch logs", "Cloudflare", "GitHub Actions"]) {
      const link = page.getByRole("link", { name: new RegExp(`^${name}`) });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }

    // The strict CSP (no inline script or style) would surface here first.
    expect(problems).toEqual([]);
  });

  test("an email that is not a maintainer gets Not authorized and no bundle", async ({ page, request }) => {
    const response = await page.goto(`${OPS_NON_MAINTAINER_BASE_URL}/`);

    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "Not authorized" })).toBeVisible();
    expect(await page.locator("script").count()).toBe(0);

    const whoami = await request.get(`${OPS_NON_MAINTAINER_BASE_URL}/ops-api/v1/whoami`);
    expect(whoami.status()).toBe(403);
    expect(await whoami.json()).toEqual({ error: "FORBIDDEN" });
  });
});

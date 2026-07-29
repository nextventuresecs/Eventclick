import { test, expect } from "@playwright/test";

test.describe("Health endpoints", () => {
  const API_BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

  test("health endpoint responds", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/health`);
    expect(res.ok()).toBe(true);
  });

  test("ready endpoint responds", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/ready`);
    expect([200, 503]).toContain(res.status());
  });
});

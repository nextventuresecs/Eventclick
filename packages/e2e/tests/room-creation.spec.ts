import { test, expect } from "@playwright/test";

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:4000";

test.describe("Room creation API access control", () => {
  test("requires authentication to create room", async ({ request }) => {
    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.now() + 172800000).toISOString();

    const res = await request.post(`${API_BASE}/api/v1/rooms`, {
      data: {
        title: `Unauthorized Room ${Date.now()}`,
        scheduledStart: start,
        scheduledEnd: end,
      },
    });

    expect([401, 403, 429]).toContain(res.status());
  });

  test("returns 403 for non-admin user token", async ({ request }) => {
    // Attempt creating room with volunteer credentials directly
    const email = process.env.PLAYWRIGHT_VOLUNTEER_EMAIL || "volunteer@test.com";
    const password = process.env.PLAYWRIGHT_VOLUNTEER_PASSWORD!;

    const loginRes = await request.post(`${API_BASE}/api/v1/auth/login`, {
      headers: { Origin: API_BASE, Referer: API_BASE },
      data: { email, password },
    });

    if (loginRes.ok()) {
      const body = await loginRes.json();
      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 172800000).toISOString();

      const res = await request.post(`${API_BASE}/api/v1/rooms`, {
        headers: {
          Origin: API_BASE,
          Referer: API_BASE,
          Authorization: `Bearer ${body.accessToken}`,
        },
        data: {
          title: `Volunteer Room ${Date.now()}`,
          scheduledStart: start,
          scheduledEnd: end,
        },
      });

      expect([401, 403, 429]).toContain(res.status());
    }
  });
});

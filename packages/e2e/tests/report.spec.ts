import { test, expect } from "../fixtures";
import { ReportsPage } from "../pages/ReportsPage";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3000";
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:4000";

const authHeaders = {
  "Origin": API_BASE,
  "Referer": API_BASE,
};

async function getAdminToken() {
  const email = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

  const loginRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ email, password }),
  });

  if (loginRes.ok) {
    const body = await loginRes.json();
    return body.accessToken;
  }
  return null;
}

async function createEndedRoom(token: string, title: string) {
  const start = new Date(Date.now() - 172800000).toISOString();
  const end = new Date(Date.now() - 86400000).toISOString();

  const res = await fetch(`${API_BASE}/api/v1/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": API_BASE,
      "Referer": API_BASE,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title,
      scheduledStart: start,
      scheduledEnd: end,
      status: "ended",
    }),
  });

  if (res.ok) {
    const room = await res.json();
    return room;
  }
  return null;
}

test.describe("PDF report generation", () => {
  test("admin creates ended room and downloads PDF report", async ({ page }) => {
    const adminToken = await getAdminToken();
    expect(adminToken).toBeTruthy();

    const room = await createEndedRoom(adminToken, `Report Room ${Date.now()}`);
    expect(room).toBeTruthy();

    const reportsPage = new ReportsPage(page);
    await reportsPage.goto(BASE_URL);

    await expect(reportsPage.heading).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
    await reportsPage.downloadReport(room.title);
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("reports page shows no reports when no ended rooms exist", async ({ page }) => {
    const adminToken = await getAdminToken();
    expect(adminToken).toBeTruthy();

    const reportsPage = new ReportsPage(page);
    await reportsPage.goto(BASE_URL);

    await expect(reportsPage.noReportsMessage).toBeVisible();
  });
});

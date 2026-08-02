import { test, expect } from "../fixtures";
import { DashboardPage } from "../pages/DashboardPage";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:4000";

const authHeaders = {
  "Origin": API_BASE,
  "Referer": API_BASE,
};

let adminAccessToken: string | null = null;

test.describe.serial("Dashboard journey", () => {
  let page: any;
  
  test.beforeAll(async ({ browser, request }) => {
    page = await browser.newPage({ storageState: ".auth/admin.json" });
    
    const email = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
    const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;

    const loginRes = await request.post(`${API_BASE}/api/v1/auth/login`, {
      headers: authHeaders,
      data: { email, password },
    });

    if (loginRes.ok()) {
      const body = await loginRes.json();
      adminAccessToken = body.accessToken;
    }
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("loads dashboard with metric cards and room list", async () => {
    expect(adminAccessToken).toBeTruthy();

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto(BASE_URL);

    await expect(dashboardPage.welcomeHeading).toBeVisible();
  });

  test("navigates to create room page", async () => {
    expect(adminAccessToken).toBeTruthy();

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto(BASE_URL);
    await dashboardPage.clickCreateRoom();

    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/rooms/create`));
    await expect(page.getByRole("heading", { name: /create new room/i })).toBeVisible();
  });

  test("displays created rooms in room list", async ({ request }) => {
    expect(adminAccessToken).toBeTruthy();

    const start = new Date(Date.now() + 86400000).toISOString();
    const end = new Date(Date.now() + 172800000).toISOString();

    const res = await request.post(`${API_BASE}/api/v1/rooms`, {
      headers: {
        "Content-Type": "application/json",
        "Origin": API_BASE,
        "Referer": API_BASE,
        Authorization: `Bearer ${adminAccessToken}`,
      },
      data: {
        title: `Dashboard Test Room ${Date.now()}`,
        scheduledStart: start,
        scheduledEnd: end,
      },
    });

    expect(res.ok()).toBe(true);
    const room = await res.json();

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto(BASE_URL);

    const roomCard = await dashboardPage.getRoomCardByTitle(room.title);
    await expect(roomCard).toBeVisible();
  });

  test("navigates to reports page", async () => {
    expect(adminAccessToken).toBeTruthy();

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto(BASE_URL);
    await dashboardPage.clickReports();

    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/reports`));
    await expect(page.getByRole("heading", { name: /reports/i })).toBeVisible();
  });
});

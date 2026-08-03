import { test, expect } from "../fixtures";
import { DashboardPage } from "../pages/DashboardPage";
import { createRoom } from "../utils/api-helpers";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.describe("Dashboard journey", () => {
  test("loads dashboard with metric cards and room list", async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto(BASE_URL);

    await expect(dashboardPage.welcomeHeading).toBeVisible();
  });

  test("navigates to create room page", async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto(BASE_URL);
    await dashboardPage.clickCreateRoom();

    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/rooms/create`));
    await expect(page.getByRole("heading", { name: /create new room/i })).toBeVisible();
  });

  test("displays created rooms in room list", async ({ page, request, adminToken }) => {
    const room = await createRoom(request, adminToken, `Dashboard Test Room ${Date.now()}`);

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto(BASE_URL);

    const roomCard = await dashboardPage.getRoomCardByTitle(room.title);
    await expect(roomCard).toBeVisible();
  });

  test("navigates to reports page", async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto(BASE_URL);
    await dashboardPage.clickReports();

    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/reports`));
    await expect(page.getByRole("heading", { name: /reports/i })).toBeVisible();
  });
});

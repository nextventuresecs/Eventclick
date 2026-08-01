import { test, expect } from "../fixtures";
import { CreateRoomPage } from "../pages/CreateRoomPage";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3000";
console.log(BASE_URL)
test.describe("CreateRoom journey", () => {
  test.use({ storageState: ".auth/admin.json" });

  test("loads create room page with form fields", async ({ page }) => {
    const createRoomPage = new CreateRoomPage(page);
    await createRoomPage.goto(BASE_URL);

    await expect(createRoomPage.heading).toBeVisible();
    await expect(createRoomPage.titleInput).toBeVisible();
    await expect(createRoomPage.submitButton).toBeVisible();
  });

  test("creates a room with activity definitions", async ({ page }) => {
    const createRoomPage = new CreateRoomPage(page);
    await createRoomPage.goto(BASE_URL);

    const start = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    const end = new Date(Date.now() + 172800000).toISOString().slice(0, 16);

    await createRoomPage.fillRoomDetails({
      title: `E2E Test Room ${Date.now()}`,
      description: "Test room created by E2E",
      location: "Test Location",
      scheduledStart: start,
      scheduledEnd: end,
      maxParticipants: "50",
      attendanceWindowBefore: "15",
      attendanceWindowAfter: "30",
    });

    await createRoomPage.addActivity("Test Activity", 1);
    await createRoomPage.submit();

    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/dashboard`));
    await expect(page.getByText(/e2e test room/i)).toBeVisible();
  });
});

test.describe("CreateRoom access control", () => {
  test.use({ storageState: ".auth/volunteer.json" });

  test("shows access limited for non-admin", async ({ page }) => {
    const createRoomPage = new CreateRoomPage(page);
    await createRoomPage.goto(BASE_URL);

    await expect(page.getByText(/access limited/i)).toBeVisible();
  });
});

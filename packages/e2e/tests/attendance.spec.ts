import { test, expect } from "../fixtures";
import { AttendancePage } from "../pages/AttendancePage";
import {
  createRoom,
  createRoomForm,
  assignUserToRoom,
  getUserId,
} from "../utils/api-helpers";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.describe("Attendance journey", () => {
  test.use({ role: "volunteer" });

  test("admin creates room with form, volunteer submits attendance", async ({
    page,
    request,
    adminToken,
    volunteerToken,
  }) => {
    test.setTimeout(60000);
    const room = await createRoom(request, adminToken, `Attendance Test Room ${Date.now()}`, { status: "live" });
    await createRoomForm(request, adminToken, room.id);

    const volunteerId = await getUserId(request, volunteerToken);
    await assignUserToRoom(request, adminToken, volunteerId, room.id);

    const attendancePage = new AttendancePage(page);
    await attendancePage.goto(BASE_URL, room.id);

    await expect(attendancePage.heading).toBeVisible();

    await attendancePage.fillField("name", "Test Attendee");
    await attendancePage.fillField("email", "attendee@example.com");
    await attendancePage.submit();

    await expect(page.getByText(/submitted at|attendance recorded|thank you/i)).toBeVisible({ timeout: 20000 });
  });

  test("rejects attendance with empty required fields", async ({
    page,
    request,
    adminToken,
    volunteerToken,
  }) => {
    const room = await createRoom(request, adminToken, `Empty Field Room ${Date.now()}`, { status: "live" });
    await createRoomForm(request, adminToken, room.id);

    const volunteerId = await getUserId(request, volunteerToken);
    await assignUserToRoom(request, adminToken, volunteerId, room.id);

    const attendancePage = new AttendancePage(page);
    await attendancePage.goto(BASE_URL, room.id);
    await page.locator("#name").waitFor({ state: "visible", timeout: 15000 });

    await attendancePage.submit();

    await expect(page.locator("input:invalid").first()).toBeVisible();
  });
});

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
  test.use({ storageState: ".auth/volunteer.json" });

  test("admin creates room with form, volunteer submits attendance", async ({
    page,
    request,
    adminToken,
    volunteerToken,
  }) => {
    const room = await createRoom(request, adminToken, `Attendance Test Room ${Date.now()}`);
    await createRoomForm(request, adminToken, room.id);

    const volunteerId = await getUserId(request, volunteerToken);
    await assignUserToRoom(request, adminToken, volunteerId, room.id);

    const attendancePage = new AttendancePage(page);
    await attendancePage.goto(BASE_URL, room.id);

    await expect(attendancePage.heading).toBeVisible();

    await attendancePage.fillField("name", "Test Attendee");
    await attendancePage.fillField("email", "attendee@example.com");
    await attendancePage.submit();

    await expect(page.getByText(/submitted at|attendance recorded|thank you/i)).toBeVisible({ timeout: 10000 });
  });

  test("rejects attendance with empty required fields", async ({
    page,
    request,
    adminToken,
    volunteerToken,
  }) => {
    const room = await createRoom(request, adminToken, `Empty Field Room ${Date.now()}`);
    await createRoomForm(request, adminToken, room.id);

    const volunteerId = await getUserId(request, volunteerToken);
    await assignUserToRoom(request, adminToken, volunteerId, room.id);

    const attendancePage = new AttendancePage(page);
    await attendancePage.goto(BASE_URL, room.id);

    await attendancePage.submit();

    const errorText = page.locator(".text-destructive, [class*='error']").first();
    await expect(errorText).toBeVisible({ timeout: 5000 });
  });
});

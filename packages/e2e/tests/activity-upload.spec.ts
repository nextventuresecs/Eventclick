import { test, expect } from "../fixtures";
import { RoomLivePage } from "../pages/RoomLivePage";
import { createRoom, assignUserToRoom, getUserId } from "../utils/api-helpers";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";

test.describe("Activity upload journey", () => {
  test.use({ storageState: ".auth/volunteer.json" });

  test("admin creates room with activity, volunteer views room live", async ({
    page,
    request,
    adminToken,
    volunteerToken,
  }) => {
    const room = await createRoom(request, adminToken, `Activity Room ${Date.now()}`, {
      activityDefinitions: [
        {
          id: `act_${Date.now()}`,
          title: "Photo Proof Activity",
          description: "Upload a photo proof",
          min_photos: 1,
        },
      ],
    });

    const volunteerId = await getUserId(request, volunteerToken);
    await assignUserToRoom(request, adminToken, volunteerId, room.id);

    const roomLivePage = new RoomLivePage(page);
    await roomLivePage.goto(BASE_URL, room.id);

    await expect(page.getByRole("heading", { name: new RegExp(room.title, "i") })).toBeVisible();
    await expect(page.getByText(/photo proof activity/i)).toBeVisible();
  });
});

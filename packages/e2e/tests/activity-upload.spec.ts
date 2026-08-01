import { test, expect } from "../fixtures";
import { RoomLivePage } from "../pages/RoomLivePage";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3000";
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:4000";

const authHeaders = {
  "Origin": API_BASE,
  "Referer": API_BASE,
};

async function getAdminToken() {
  const email = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD

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

async function createRoomWithActivities(token: string, title: string) {
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 172800000).toISOString();

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
      activityDefinitions: [
        {
          id: `act_${Date.now()}`,
          title: "Photo Proof Activity",
          description: "Upload a photo proof",
          min_photos: 1,
        },
      ],
    }),
  });

  if (res.ok) {
    return await res.json();
  }
  return null;
}

async function getVolunteerToken() {
  const email = process.env.PLAYWRIGHT_VOLUNTEER_EMAIL || "volunteer@test.com";
  const password = process.env.PLAYWRIGHT_VOLUNTEER_PASSWORD

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

async function getVolunteerId() {
  const token = await getVolunteerToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok) {
    const body = await res.json();
    return body.user.id;
  }
  return null;
}

async function assignVolunteerToRoom(adminToken: string, volunteerId: string, roomId: string) {
  const res = await fetch(`${API_BASE}/api/v1/event-assignments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": API_BASE,
      "Referer": API_BASE,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      userId: volunteerId,
      roomId,
    }),
  });

  return res.ok;
}

test.describe("Activity upload journey", () => {
  test.use({ storageState: ".auth/volunteer.json" });

  test("admin creates room with activity, volunteer views room live", async ({ page }) => {
    const adminToken = await getAdminToken();
    expect(adminToken).toBeTruthy();

    const room = await createRoomWithActivities(adminToken, `Activity Room ${Date.now()}`);
    expect(room).toBeTruthy();

    const volunteerId = await getVolunteerId();
    expect(volunteerId).toBeTruthy();

    const assigned = await assignVolunteerToRoom(adminToken, volunteerId, room.id);
    expect(assigned).toBe(true);

    const roomLivePage = new RoomLivePage(page);
    await roomLivePage.goto(BASE_URL, room.id);

    await expect(page.getByRole("heading", { name: new RegExp(room.title, "i") })).toBeVisible();
    await expect(page.getByText(/photo proof activity/i)).toBeVisible();
  });
});

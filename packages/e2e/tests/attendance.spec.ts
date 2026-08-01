import { test, expect } from "../fixtures";
import { AttendancePage } from "../pages/AttendancePage";

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:4000";

const authHeaders = {
  "Origin": API_BASE,
  "Referer": API_BASE,
};

async function getAdminToken() {
  const email = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD || "E2eStrong!2024XyZ";

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

async function getVolunteerToken() {
  const email = process.env.PLAYWRIGHT_VOLUNTEER_EMAIL || "volunteer@test.com";
  const password = process.env.PLAYWRIGHT_VOLUNTEER_PASSWORD || "E2eStrong!2024XyZ";

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

async function createRoom(token: string, title: string) {
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
    }),
  });

  if (res.ok) {
    return await res.json();
  }
  return null;
}

async function createForm(token: string, roomId: string) {
  const res = await fetch(`${API_BASE}/api/v1/rooms/${roomId}/form`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Origin": API_BASE,
      "Referer": API_BASE,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fields: [
        { id: "name", label: "Full Name", type: "text", required: true },
        { id: "email", label: "Email Address", type: "email", required: true },
      ],
    }),
  });

  if (res.ok) {
    return await res.json();
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

test.describe("Attendance journey", () => {
  test.use({ storageState: ".auth/volunteer.json" });

  test("admin creates room with form, volunteer submits attendance", async ({ page }) => {
    const adminToken = await getAdminToken();
    expect(adminToken).toBeTruthy();

    const room = await createRoom(adminToken, `Attendance Test Room ${Date.now()}`);
    expect(room).toBeTruthy();

    const form = await createForm(adminToken, room.id);
    expect(form).toBeTruthy();

    const volunteerId = await getVolunteerId();
    expect(volunteerId).toBeTruthy();

    const assigned = await assignVolunteerToRoom(adminToken, volunteerId, room.id);
    expect(assigned).toBe(true);

    const attendancePage = new AttendancePage(page);
    await attendancePage.goto(BASE_URL, room.id);

    await expect(attendancePage.heading).toBeVisible();

    await attendancePage.fillField("name", "Test Attendee");
    await attendancePage.fillField("email", "attendee@example.com");
    await attendancePage.submit();

    await expect(page.getByText(/submitted at/i)).toBeVisible({ timeout: 10000 });
  });

  test("rejects attendance with empty required fields", async ({ page }) => {
    const adminToken = await getAdminToken();
    expect(adminToken).toBeTruthy();

    const room = await createRoom(adminToken, `Empty Field Room ${Date.now()}`);
    expect(room).toBeTruthy();

    const form = await createForm(adminToken, room.id);
    expect(form).toBeTruthy();

    const volunteerId = await getVolunteerId();
    expect(volunteerId).toBeTruthy();

    const assigned = await assignVolunteerToRoom(adminToken, volunteerId, room.id);
    expect(assigned).toBe(true);

    const attendancePage = new AttendancePage(page);
    await attendancePage.goto(BASE_URL, room.id);

    await attendancePage.submit();

    const errorText = page.locator(".text-destructive, [class*='error']").first();
    await expect(errorText).toBeVisible({ timeout: 5000 });
  });
});

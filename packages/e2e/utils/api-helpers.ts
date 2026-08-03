import { type APIRequestContext } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:4000";

const TOKENS_PATH = path.resolve(__dirname, "../.auth/tokens.json");

export interface StoredTokens {
  adminAccessToken: string;
  volunteerAccessToken: string;
}

export function saveTokens(tokens: StoredTokens): void {
  mkdirSync(path.dirname(TOKENS_PATH), { recursive: true });
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

export function loadTokens(): StoredTokens {
  const content = readFileSync(TOKENS_PATH, "utf-8");
  return JSON.parse(content) as StoredTokens;
}

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    "Origin": API_BASE,
    "Referer": API_BASE,
    Authorization: `Bearer ${token}`,
  };
}

export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const res = await request.post(`${API_BASE}/api/v1/auth/login`, {
    headers: { "Origin": API_BASE, "Referer": API_BASE },
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`Login failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const setCookie = res.headers()["set-cookie"] || "";
  const match = setCookie.match(/Eventclick_rt=([^;]+)/);
  return { accessToken: body.accessToken, refreshToken: match?.[1] ?? null };
}

export async function createRoom(
  request: APIRequestContext,
  token: string,
  title: string,
  overrides: Record<string, unknown> = {},
) {
  const start = new Date(Date.now() + 86_400_000).toISOString();
  const end = new Date(Date.now() + 172_800_000).toISOString();

  const res = await request.post(`${API_BASE}/api/v1/rooms`, {
    headers: authHeaders(token),
    data: { title, scheduledStart: start, scheduledEnd: end, ...overrides },
  });
  if (!res.ok()) {
    throw new Error(`createRoom failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function createEndedRoom(
  request: APIRequestContext,
  token: string,
  title: string,
) {
  const start = new Date(Date.now() - 172_800_000).toISOString();
  const end = new Date(Date.now() - 86_400_000).toISOString();

  const res = await request.post(`${API_BASE}/api/v1/rooms`, {
    headers: authHeaders(token),
    data: { title, scheduledStart: start, scheduledEnd: end, status: "ended" },
  });
  if (!res.ok()) {
    throw new Error(`createEndedRoom failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function createRoomForm(
  request: APIRequestContext,
  token: string,
  roomId: string,
  fields = [
    { id: "name", label: "Full Name", type: "text", required: true },
    { id: "email", label: "Email Address", type: "email", required: true },
  ],
) {
  const res = await request.put(`${API_BASE}/api/v1/rooms/${roomId}/form`, {
    headers: authHeaders(token),
    data: { fields },
  });
  if (!res.ok()) {
    throw new Error(`createRoomForm failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function assignUserToRoom(
  request: APIRequestContext,
  adminToken: string,
  userId: string,
  roomId: string,
) {
  const res = await request.post(`${API_BASE}/api/v1/event-assignments`, {
    headers: authHeaders(adminToken),
    data: { userId, roomId },
  });
  if (!res.ok()) {
    throw new Error(`assignUserToRoom failed: ${res.status()} ${await res.text()}`);
  }
}

export async function getUserId(
  request: APIRequestContext,
  token: string,
): Promise<string> {
  const res = await request.get(`${API_BASE}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`getUserId failed: ${res.status()}`);
  }
  const body = await res.json();
  return body.user.id;
}

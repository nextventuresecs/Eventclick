import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendToSubscription, sendToUser, isPushConfigured } from "../push.service";

vi.mock("../../config/env", () => ({
  env: {
    VAPID_PUBLIC_KEY: "test-public-key",
    VAPID_PRIVATE_KEY: "test-private-key",
    VAPID_SUBJECT: "mailto:test@eventclick.live",
  },
}));

const mockSendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

let mockSelectResult: any[] = [];
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(mockSelectResult),
      }),
    }),
    delete: () => ({
      where: mockDeleteWhere,
    }),
  },
}));

const fakeSubscription = {
  id: "sub-1",
  userId: "user-1",
  organizationId: "org-1",
  endpoint: "https://push.example/abc",
  p256dh: "p256dh-key",
  auth: "auth-key",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("push.service", () => {
  beforeEach(() => {
    mockSendNotification.mockReset();
    mockDeleteWhere.mockClear();
    mockSelectResult = [];
  });

  it("reports configured when VAPID keys are present", () => {
    expect(isPushConfigured()).toBe(true);
  });

  it("sends successfully and does not revoke on success", async () => {
    mockSendNotification.mockResolvedValueOnce(undefined);

    const result = await sendToSubscription(fakeSubscription, { title: "Hi", body: "There" });

    expect(result).toEqual({ ok: true });
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  // Regression guard: acceptance criterion "an expired/invalid subscription
  // is detected on send failure and removed, not retried indefinitely."
  it("revokes the subscription when the push service reports 410 Gone", async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 410 });

    const result = await sendToSubscription(fakeSubscription, { title: "Hi", body: "There" });

    expect(result).toEqual({ ok: false, revoked: true });
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });

  it("revokes the subscription when the push service reports 404 Not Found", async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 404 });

    const result = await sendToSubscription(fakeSubscription, { title: "Hi", body: "There" });

    expect(result).toEqual({ ok: false, revoked: true });
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });

  it("does not revoke on a transient failure (5xx)", async () => {
    mockSendNotification.mockRejectedValueOnce({ statusCode: 503 });

    const result = await sendToSubscription(fakeSubscription, { title: "Hi", body: "There" });

    expect(result).toEqual({ ok: false, revoked: false });
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });

  it("sendToUser sends to every subscription the user has", async () => {
    mockSelectResult = [fakeSubscription, { ...fakeSubscription, id: "sub-2", endpoint: "https://push.example/def" }];
    mockSendNotification.mockResolvedValue(undefined);

    const result = await sendToUser("user-1", { title: "Hi", body: "There" });

    expect(result).toEqual({ attempted: 2, sent: 2 });
  });

  // #71: ATTENDANCE_WINDOW_CLOSING must go out with high urgency + a short
  // TTL — arriving after the window closed is worse than not arriving.
  it("defaults to normal urgency with no explicit options", async () => {
    mockSendNotification.mockResolvedValueOnce(undefined);

    await sendToSubscription(fakeSubscription, { title: "Hi", body: "There" });

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ urgency: "normal" }),
    );
  });

  it("passes high urgency and a TTL through to web-push when requested", async () => {
    mockSendNotification.mockResolvedValueOnce(undefined);

    await sendToSubscription(fakeSubscription, { title: "Hi", body: "There" }, { urgency: "high", ttlSeconds: 300 });

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ urgency: "high", TTL: 300 }),
    );
  });

  it("sendToUser threads urgency options through to every subscription", async () => {
    mockSelectResult = [fakeSubscription];
    mockSendNotification.mockResolvedValueOnce(undefined);

    await sendToUser("user-1", { title: "Hi", body: "There" }, { urgency: "high", ttlSeconds: 300 });

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ urgency: "high", TTL: 300 }),
    );
  });
});

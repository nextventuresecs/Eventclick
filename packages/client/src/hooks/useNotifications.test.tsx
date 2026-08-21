import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useNotifications, type Notification } from "./useNotifications";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

const stableUser = { id: "user-1" };
vi.mock("./useAuth", () => ({
  useAuth: () => ({ user: stableUser }),
}));

const mockToast = vi.fn();
vi.mock("./useToast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// jsdom has no EventSource — stub a minimal controllable one and capture the
// instance so tests can drive `onmessage` directly.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

const notif = (overrides: Partial<Notification> = {}): Notification => ({
  id: "n1",
  type: "ORG_BROADCAST",
  title: "Hello",
  message: "World",
  isRead: false,
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeEventSource.instances = [];
    (globalThis as any).EventSource = FakeEventSource;
    vi.mocked(api.get).mockResolvedValue([]);
  });

  it("toasts on a live SSE message", async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() => {
      FakeEventSource.instances[0]!.onmessage?.({ data: JSON.stringify(notif({ id: "n2", title: "Live now" })) });
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(mockToast).toHaveBeenCalledWith("Live now", "info");
  });

  it("ignores ping keep-alive messages — no toast, no notification added", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() => {
      FakeEventSource.instances[0]!.onmessage?.({ data: JSON.stringify({ type: "ping" }) });
    });

    expect(result.current.notifications).toHaveLength(0);
    expect(mockToast).not.toHaveBeenCalled();
  });

  // Regression guard for the optimistic-rollback gap flagged in #67:
  // markAsRead used to leave the client showing "read" forever on a failed
  // PATCH, with no way to recover except a full refetch.
  it("markAsRead reverts the optimistic update when the PATCH fails", async () => {
    vi.mocked(api.get).mockResolvedValue([notif({ id: "n1", isRead: false })]);
    vi.mocked(api.patch).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0]!.isRead).toBe(false);

    await act(async () => {
      await result.current.markAsRead.mutate("n1");
    });

    expect(result.current.notifications[0]!.isRead).toBe(false);
  });

  it("markAsRead keeps the optimistic update when the PATCH succeeds", async () => {
    vi.mocked(api.get).mockResolvedValue([notif({ id: "n1", isRead: false })]);
    vi.mocked(api.patch).mockResolvedValue(undefined);

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markAsRead.mutate("n1");
    });

    expect(result.current.notifications[0]!.isRead).toBe(true);
  });

  it("markAllAsRead reverts the optimistic update when the request fails", async () => {
    vi.mocked(api.get).mockResolvedValue([notif({ id: "n1", isRead: false }), notif({ id: "n2", isRead: false })]);
    vi.mocked(api.post).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    await act(async () => {
      await result.current.markAllAsRead.mutate();
    });

    expect(result.current.notifications.some((n) => !n.isRead)).toBe(true);
  });
});

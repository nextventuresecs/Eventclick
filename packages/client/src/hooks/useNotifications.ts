import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { useAuth } from "./useAuth";
import { useToast } from "./useToast";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const byNewestFirst = (a: Notification, b: Notification) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/**
 * Server rows win on conflict — most importantly for `isRead`, so a
 * notification read on another device comes back read here. Entries the
 * response does not mention are kept: the history endpoint returns only the
 * newest 50 rows, and an item that streamed in while the request was in
 * flight must not be dropped either.
 */
const mergeById = (incoming: Notification[], existing: Notification[]): Notification[] => {
  const byId = new Map(incoming.map((n) => [n.id, n]));
  for (const n of existing) if (!byId.has(n.id)) byId.set(n.id, n);
  return [...byId.values()].sort(byNewestFirst);
};

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  const resyncInFlight = useRef(false);

  /**
   * Recovers what the live channel could not deliver.
   *
   * Redis pub/sub has no replay: anything published while the SSE connection
   * was down is never sent to this client, even though the row is durable on
   * the server. Without this, the badge undercounts until a full page reload.
   */
  const resync = useCallback(async () => {
    if (resyncInFlight.current) return;
    resyncInFlight.current = true;
    try {
      const data = await api.get<Notification[]>("/notifications");
      setNotifications((old) => mergeById(data || [], old));
    } catch (err) {
      console.error("Failed to resync notifications:", err);
    } finally {
      resyncInFlight.current = false;
    }
  }, []);

  // Fetch initial history
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    api
      .get<Notification[]>("/notifications")
      .then((data) => {
        if (isMounted) {
          setNotifications(data || []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load notifications:", err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  // SSE Subscription for live updates
  useEffect(() => {
    if (!user) return;

    const eventSource = new EventSource(`${import.meta.env.VITE_API_URL}/notifications/stream`, {
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "ping") return;

        setNotifications((old) => {
          if (old.some((n) => n.id === payload.id)) return old;
          return [payload, ...old];
        });

        // Server-side debouncing (e.g. EVENT_STREAM_STATE_CHANGED) already
        // collapses bursty state changes into one message per quiet window,
        // so it's safe to toast on every message received here.
        toast(payload.title ?? payload.message ?? "New notification", "info");
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };

    // Every open after the first is a reconnect, and a reconnect means the
    // stream was down for some interval. The first open is the initial
    // connection, whose gap the mount-time history fetch above already covers.
    let hasOpened = false;
    eventSource.onopen = () => {
      if (hasOpened) void resync();
      hasOpened = true;
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error, it will auto-reconnect", err);
    };

    // Both triggers are needed. `online` alone misses a proxy timeout or a
    // server restart, which drops the stream without the browser ever going
    // offline; `onopen` alone misses the window after a device wakes, when
    // connectivity is back but EventSource has not reopened yet. A shared
    // in-flight guard keeps the two from firing duplicate requests when they
    // land in the same second, as they usually do on wake.
    const onOnline = () => void resync();
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", onOnline);
      eventSource.close();
    };
  }, [user, toast, resync]);

  const markAsRead = useCallback(async (id: string) => {
    const previous = notificationsRef.current;
    // Optimistic update
    setNotifications((old) => old.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch (err) {
      console.error("Failed to mark notification as read", err);
      setNotifications(previous);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const previous = notificationsRef.current;
    // Optimistic update
    setNotifications((old) => old.map((n) => ({ ...n, isRead: true })));
    try {
      await api.post("/notifications/read-all");
    } catch (err) {
      console.error("Failed to mark all notifications as read", err);
      setNotifications(previous);
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: { mutate: markAsRead, isPending: false },
    markAllAsRead: { mutate: markAllAsRead, isPending: false },
  };
}

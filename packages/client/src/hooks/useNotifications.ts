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

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

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

    eventSource.onerror = (err) => {
      console.error("SSE connection error, it will auto-reconnect", err);
    };

    return () => {
      eventSource.close();
    };
  }, [user, toast]);

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

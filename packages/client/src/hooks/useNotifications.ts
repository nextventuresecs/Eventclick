import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAuth } from "./useAuth";

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
  }, [user]);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((old) => old.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch (err) {
      console.error("Failed to mark notification as read", err);
      // Revert optimistic update? For simplicity, we just leave it or refetch
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((old) => old.map((n) => ({ ...n, isRead: true })));
    try {
      await api.post("/notifications/read-all");
    } catch (err) {
      console.error("Failed to mark all notifications as read", err);
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

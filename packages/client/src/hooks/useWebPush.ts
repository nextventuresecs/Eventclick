import { useCallback, useEffect, useState } from "react";
import { pushApi, ApiClientError } from "@/lib/api";
import { isPushSupported, urlBase64ToUint8Array } from "@/lib/webPush";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export interface UseWebPush {
  supported: boolean;
  subscribed: boolean;
  loading: boolean;
  error: string | null;
  subscribe: () => Promise<{ ok: boolean; error?: string }>;
  unsubscribe: () => Promise<{ ok: boolean; error?: string }>;
  sendTest: () => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Owns the browser-side PushManager subscription lifecycle. The server
 * subscription row is the source of truth for "is push on" across devices,
 * but the browser's own subscription (or lack of one) is authoritative for
 * *this* device, so state is derived from a `getSubscription()` check on
 * mount rather than persisted client-side.
 */
export const useWebPush = (): UseWebPush => {
  const capable = isPushSupported() && Boolean(VAPID_PUBLIC_KEY);
  // capable = browser/build could support push; registered = a service
  // worker is actually installed right now. getRegistration() resolves
  // immediately either way — unlike `serviceWorker.ready`, which hangs
  // forever when no SW is registered (e.g. local dev with VITE_PWA_DEV
  // unset), which would otherwise leave this hook stuck in `loading: true`.
  const [registered, setRegistered] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = capable && registered;

  useEffect(() => {
    if (!capable) return;
    let cancelled = false;

    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (cancelled) return;
        setRegistered(registration !== undefined);
        return registration?.pushManager.getSubscription();
      })
      .then((subscription) => {
        if (!cancelled) setSubscribed(subscription != null);
      })
      .catch(() => {
        if (!cancelled) {
          setRegistered(false);
          setSubscribed(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [capable]);

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supported || !VAPID_PUBLIC_KEY) {
      const message = "Push notifications are not supported on this device/browser.";
      setError(message);
      return { ok: false, error: message };
    }

    setLoading(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        const message = "Push notification permission was denied.";
        setError(message);
        return { ok: false, error: message };
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Browser returned an incomplete push subscription");
      }

      await pushApi.subscribe({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setSubscribed(true);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Failed to enable push notifications.";
      setError(message);
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await pushApi.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Failed to disable push notifications.";
      setError(message);
      return { ok: false, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const sendTest = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setError(null);
    try {
      await pushApi.test();
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Failed to send test push.";
      setError(message);
      return { ok: false, error: message };
    }
  }, []);

  return { supported, subscribed, loading, error, subscribe, unsubscribe, sendTest };
};

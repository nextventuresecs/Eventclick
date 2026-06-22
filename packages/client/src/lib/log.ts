import type { ClientLogInput, ClientLogLevel } from "@application/shared";

const API_URL = import.meta.env.VITE_API_URL || "/api/v1";
const MAX_PER_WINDOW = 20;
const WINDOW_MS = 60_000;

let windowStart = Date.now();
let inWindow = 0;

const throttled = (): boolean => {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    inWindow = 0;
  }
  if (inWindow >= MAX_PER_WINDOW) return true;
  inWindow++;
  return false;
};

const ship = (entry: ClientLogInput): void => {
  if (throttled()) return;
  const body = JSON.stringify(entry);
  try {
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(`${API_URL}/logs/client-error`, blob);
      return;
    }
  } catch {
    // fall through to fetch
  }
  void fetch(`${API_URL}/logs/client-error`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "include",
    keepalive: true,
  }).catch(() => {
    /* swallow — logging must never throw */
  });
};

const toEntry = (
  level: ClientLogLevel,
  message: string,
  stack?: string,
  context?: Record<string, unknown>,
): ClientLogInput => ({
  level,
  message: message.slice(0, 2000),
  stack: stack?.slice(0, 8000),
  url: typeof window !== "undefined" ? window.location.href : undefined,
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  context,
  timestamp: new Date().toISOString(),
});

export const clientLog = {
  error: (message: string, stack?: string, context?: Record<string, unknown>) => {
    console.error(message, stack, context);
    ship(toEntry("error", message, stack, context));
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(message, context);
    ship(toEntry("warn", message, undefined, context));
  },
  info: (message: string, context?: Record<string, unknown>) => {
    console.info(message, context);
    ship(toEntry("info", message, undefined, context));
  },
};

export const installGlobalErrorHandlers = (): void => {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    clientLog.error(
      event.message || "window.onerror",
      event.error instanceof Error ? event.error.stack : undefined,
      { filename: event.filename, lineno: event.lineno, colno: event.colno },
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    clientLog.error(`unhandledrejection: ${msg}`, stack);
  });
};

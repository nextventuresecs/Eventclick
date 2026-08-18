/**
 * PWA install support.
 *
 * `beforeinstallprompt` fires once per page load, shortly after the manifest and
 * service worker are parsed — which in a real session happens while the user is
 * still on `/login`. A listener registered inside a component that only mounts
 * after login (e.g. the dashboard) never sees it, because SPA navigation does
 * not reload the page. So the listener is registered here at module scope and
 * this module is imported from `main.tsx`, before React mounts.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * How the current browser can install the app. There is no reliable way to
 * detect "already installed" from a normal tab, so we never claim that — the
 * non-prompt paths describe how to install rather than asserting support.
 */
export type InstallPlatform =
  | "prompt" // Chrome/Edge/Samsung — native install prompt is available
  | "standalone" // already running as an installed app
  | "ios-safari" // iOS/iPadOS Safari — Share → Add to Home Screen
  | "ios-other" // Chrome/Firefox/Edge on iOS — cannot install, must use Safari
  | "macos-safari" // macOS Safari — File → Add to Dock
  | "manual"; // anything else — browser menu → Install

export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  hasPrompt: boolean;
  isStandalone: boolean;
}

/** Pure — all environment access is done by the caller so this stays testable. */
export const resolveInstallPlatform = (env: InstallEnvironment): InstallPlatform => {
  if (env.isStandalone) return "standalone";
  if (env.hasPrompt) return "prompt";

  const ua = env.userAgent;
  // iPadOS 13+ reports itself as "Macintosh"; touch points disambiguate it.
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && env.maxTouchPoints > 1);

  if (isIos) {
    // Every iOS browser is WebKit, but only Safari proper can add to the home screen.
    return /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(ua) ? "ios-other" : "ios-safari";
  }

  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
  if (isSafari && /Macintosh/i.test(ua)) return "macos-safari";

  return "manual";
};

export const INSTALL_INSTRUCTIONS: Record<InstallPlatform, string> = {
  prompt: "",
  standalone: "You're already using the installed app.",
  "ios-safari": 'Tap the Share button in Safari, then choose "Add to Home Screen".',
  "ios-other": "On iPhone and iPad, only Safari can install apps. Open eventclick.live in Safari, then tap Share → Add to Home Screen.",
  "macos-safari": 'In Safari, choose File → "Add to Dock" to install Eventclick.',
  manual: 'Open your browser menu and choose "Install app" or "Add to Home Screen".',
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

const notify = () => subscribers.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export const subscribeToInstallPrompt = (fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
};

export const hasInstallPrompt = () => deferredPrompt !== null;

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

export const getInstallPlatform = (): InstallPlatform =>
  resolveInstallPlatform({
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    maxTouchPoints: typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
    hasPrompt: hasInstallPrompt(),
    isStandalone: isStandalone(),
  });

/**
 * Triggers the native install prompt. Resolves to the user's choice, or `null`
 * when no prompt was available (the caller should show instructions instead).
 */
export const triggerInstallPrompt = async (): Promise<"accepted" | "dismissed" | null> => {
  if (!deferredPrompt) return null;
  const promptEvent = deferredPrompt;
  await promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  // The prompt is single-use; Chrome re-fires beforeinstallprompt if it's still installable.
  deferredPrompt = null;
  notify();
  return outcome;
};

const CONSENT_COOKIE_NAME = "eventclick_consent";
const CONSENT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function getConsentDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return undefined;
  }
  if (hostname.endsWith(".eventclick.live") || hostname === "eventclick.live") {
    return ".eventclick.live";
  }
  return undefined;
}

export interface ConsentPreferences {
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
}

export function getConsentCookie(): ConsentPreferences | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(
    new RegExp("(^| )" + CONSENT_COOKIE_NAME + "=([^;]+)")
  );
  if (!match) return null;

  try {
    const decoded = decodeURIComponent(match[2] as string);
    const parsed = JSON.parse(decoded) as ConsentPreferences;
    if (
      typeof parsed.analytics === "boolean" &&
      typeof parsed.marketing === "boolean" &&
      typeof parsed.timestamp === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setConsentCookie(
  preferences: Omit<ConsentPreferences, "timestamp">
): void {
  if (typeof document === "undefined") return;

  const payload: ConsentPreferences = {
    ...preferences,
    timestamp: Date.now(),
  };

  const parts = [
    CONSENT_COOKIE_NAME + "=" + encodeURIComponent(JSON.stringify(payload)),
    "path=/",
    "max-age=" + CONSENT_COOKIE_MAX_AGE,
    "SameSite=Lax",
    "Secure",
  ];

  const domain = getConsentDomain();
  if (domain) {
    parts.push("domain=" + domain);
  }

  document.cookie = parts.join("; ");
}

export function hasConsent(): boolean {
  return getConsentCookie() !== null;
}

export function hasAnalyticsConsent(): boolean {
  return getConsentCookie()?.analytics ?? false;
}

export function hasMarketingConsent(): boolean {
  return getConsentCookie()?.marketing ?? false;
}

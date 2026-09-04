import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_CLIENT_DSN;

/**
 * Build-time release identifier, baked in by Dockerfile.prod from the same
 * image tag the server receives as SENTRY_RELEASE. Without it every client
 * issue is attributed to "no release": it cannot be tied to a deploy, and
 * Sentry has no release to match uploaded source maps against — which is why
 * the one client issue on file (`Error: Rejected`) carries no usable frames.
 */
const RELEASE = import.meta.env.VITE_SENTRY_RELEASE || undefined;

const isProd = import.meta.env.PROD;

const numberFromEnv = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
};

/**
 * Sampling. The server deliberately samples 5% of traces in production
 * (see server/src/instrument.ts) because prod is a two-vCPU box; a client
 * sending 100% of its traces produces a lopsided, mostly-unjoinable picture
 * and burns the same quota. Development keeps full fidelity.
 *
 * Replays are the inverse: session replay at a flat percentage is expensive
 * and mostly records nothing going wrong, so production records replays only
 * for sessions that actually error. Both are env-overridable so the policy
 * can change with a rebuild rather than a code change.
 */
const tracesSampleRate = numberFromEnv(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, isProd ? 0.1 : 1.0);
const replaysSessionSampleRate = numberFromEnv(
  import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  isProd ? 0 : 0.1,
);
const replaysOnErrorSampleRate = numberFromEnv(import.meta.env.VITE_SENTRY_REPLAYS_ERROR_SAMPLE_RATE, 1.0);

/**
 * Distributed tracing only joins client and server spans when the browser is
 * allowed to attach its trace headers to the API origin. Left at the SDK
 * default the header goes to same-origin requests only, so a cross-origin API
 * (which this is — app.eventclick.live serves the API under /api/v1) produces
 * two unrelated halves of every trace.
 */
const apiUrl = import.meta.env.VITE_API_URL;
const tracePropagationTargets: (string | RegExp)[] = [/^\//];
if (apiUrl) tracePropagationTargets.push(apiUrl);

/**
 * The server scrubs every outbound event through `scrubSensitive`; the client
 * did not scrub at all. Browser events carry their own leak paths the server's
 * field list does not cover — an access token in an Authorization header on a
 * captured fetch breadcrumb, or a token/code in a URL's query string on a
 * magic-link or OAuth callback page.
 */
const SENSITIVE_QUERY_KEYS = ["token", "code", "access_token", "refresh_token", "password", "secret"];

const scrubUrl = (value: string): string => {
  // Relative URLs are common in breadcrumbs; a base makes them parseable and
  // is stripped again below.
  let parsed: URL;
  try {
    parsed = new URL(value, "http://scrub.invalid");
  } catch {
    return value;
  }
  let touched = false;
  for (const key of SENSITIVE_QUERY_KEYS) {
    if (parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, "[REDACTED]");
      touched = true;
    }
  }
  if (!touched) return value;
  return parsed.origin === "http://scrub.invalid" ? `${parsed.pathname}${parsed.search}` : parsed.toString();
};

export function initClientSentry(): void {
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: RELEASE,
    // Never attach IPs, cookies or request bodies. Explicit rather than
    // relying on the SDK default, so a future SDK changing that default
    // cannot quietly start sending them.
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Was missing while both replay sample rates were set — the rates were
      // read, the recorder was never installed, and no replay was ever
      // captured. Configuration that looked like a feature.
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate,
    tracePropagationTargets,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,

    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubUrl(event.request.url);
      if (event.request?.headers) delete event.request.headers.Authorization;
      for (const crumb of event.breadcrumbs ?? []) {
        if (typeof crumb.data?.url === "string") crumb.data.url = scrubUrl(crumb.data.url);
      }
      return event;
    },
  });
}

// Exported for the unit test; not part of the module's runtime contract.
export const __testing = { scrubUrl };

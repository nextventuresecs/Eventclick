/**
 * Sentry initialisation. **This module must be imported first, before
 * anything else in the process** — see the first import in index.ts.
 *
 * Sentry's auto-instrumentation works by monkey-patching modules (http,
 * express, pg, redis) as they are required. Anything imported before
 * `Sentry.init()` runs gets the unpatched version, which is why the SDK's own
 * guidance is a dedicated module loaded first rather than an init call
 * somewhere in the bootstrap.
 *
 * Initialisation is **synchronous** on purpose. It used to be an async
 * `initSentry()` whose `.then()` registered the Express error handler, while
 * the app was constructed synchronously below it — so the Sentry handler
 * landed after the application's own terminal error handler, which has
 * already ended the response. Errors were not lost (errorHandler reports them
 * explicitly), but they arrived stripped of request scope, route and trace
 * context. Making this synchronous is also what keeps `export { app }` a
 * plain synchronous export, which the integration tests depend on.
 */
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { env } from "./config/env";

export const sentryEnabled = Boolean(env.SENTRY_SERVER_DSN);

if (sentryEnabled) {
  Sentry.init({
    dsn: env.SENTRY_SERVER_DSN,
    environment: env.NODE_ENV,
    integrations: [nodeProfilingIntegration()],
    // Unchanged from the previous behaviour on purpose — sampling rates,
    // profiling and outbound scrubbing are #83's subject, and changing them
    // here would mix two reviews into one.
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}

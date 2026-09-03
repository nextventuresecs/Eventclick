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
import { scrubSensitive } from "./utils/sentryScrub";

export const sentryEnabled = Boolean(env.SENTRY_SERVER_DSN);

const isProduction = env.NODE_ENV === "production";

/**
 * Production runs on a two-vCPU instance that also hosts Postgres, Redis and
 * the PDF renderer. Full tracing plus continuous profiling is CPU that box
 * does not have, on top of a quota burn — so production samples a small
 * fraction of transactions and profiles none, while development keeps full
 * fidelity where the CPU is free and the detail is useful.
 *
 * Both are env-overridable so an environment's policy can change without a
 * code change or a deploy of new code.
 */
const tracesSampleRate = env.SENTRY_TRACES_SAMPLE_RATE ?? (isProduction ? 0.05 : 1.0);
const profilesSampleRate = env.SENTRY_PROFILES_SAMPLE_RATE ?? (isProduction ? 0 : 1.0);

if (sentryEnabled) {
  Sentry.init({
    dsn: env.SENTRY_SERVER_DSN,
    environment: env.NODE_ENV,
    // Attributes every issue to the deploy that introduced it. Supplied as
    // IMAGE_TAG by scripts/deploy.sh and passed through docker-compose.prod.
    release: env.SENTRY_RELEASE,
    // Profiling costs CPU even at a zero sample rate if the integration is
    // loaded, so it is left out entirely rather than merely sampled to zero.
    integrations: profilesSampleRate > 0 ? [nodeProfilingIntegration()] : [],
    tracesSampleRate,
    profilesSampleRate,

    // The logger redacts passwords, tokens and hashes; without this, the same
    // fields still reached Sentry in full, so the careful redaction only ever
    // covered half the outbound paths. The field list is imported from the
    // logger (see utils/sentryScrub.ts) so the two cannot drift.
    beforeSend: (event) => scrubSensitive(event),
    beforeSendTransaction: (event) => scrubSensitive(event),
  });
}

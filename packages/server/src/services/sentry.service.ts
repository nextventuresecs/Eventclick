import { logger } from "../utils/logger";

let sentryModule: typeof import("@sentry/node") | null = null;

export async function initSentry(dsn: string, environment: string): Promise<void> {
  if (!dsn) return;

  try {
    const [nodeSentry, { nodeProfilingIntegration }] = await Promise.all([
      import("@sentry/node"),
      import("@sentry/profiling-node"),
    ]);

    nodeSentry.init({
      dsn,
      environment,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,
    });

    sentryModule = nodeSentry;
    logger.info("Sentry initialized successfully");
  } catch (err) {
    logger.warn({ err }, "Sentry initialization failed, continuing without error tracking");
  }
}

export function setupSentryExpressErrorHandler(app: any): void {
  if (sentryModule) {
    sentryModule.setupExpressErrorHandler(app);
  }
}

export function captureSentryException(err: unknown, context?: Record<string, unknown>): void {
  if (!sentryModule) return;

  try {
    if (context) {
      sentryModule.captureException(err, context);
    } else {
      sentryModule.captureException(err);
    }
  } catch {
    // Intentionally ignore Sentry reporting failures
  }
}

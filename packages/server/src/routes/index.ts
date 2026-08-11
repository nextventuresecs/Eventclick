import { Router } from "express";
import { authRouter } from "./auth.routes";
import { roomRouter } from "./room.routes";
import { shareRouter } from "./share.routes";
import { logRouter } from "./log.routes";
import { adminRouter } from "./admin.routes";
import { eventAssignmentRouter } from "./event-assignment.routes";
import { pool } from "../db";
import { redisClient } from "../config/redis";
import { env } from "../config/env";
import { signAccessToken, verifyAccessToken } from "../services/jwt.service";
import { s3 } from "../services/storage.service";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { metricsRegistry, metricsMiddleware } from "../services/metrics.service";
import { logger } from "../utils/logger";

export const apiRouter = Router();

// Prometheus metrics endpoint
apiRouter.get("/metrics", (_req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4");
  res.send(metricsRegistry.toPrometheus());
});

// Lightweight liveness probe (is the process alive?)
apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Shared dependency checks ────────────────────────────────────────────
// Each check logs its real error on failure instead of swallowing it —
// a silent `catch {}` here previously hid an S3/R2 region misconfiguration
// behind an opaque "storage: error" for hours. Every check below follows
// the same shape: try the operation, log+return "error" on failure.
// Used by both /ready (liveness-adjacent, DB+Redis only) and /health/deep
// (full dependency sweep for deploy-time smoke tests) so a fix here never
// drifts between the two endpoints again.

async function checkDatabase(): Promise<string> {
  try {
    const result = await pool.query("SELECT 1 AS alive");
    const isAlive = result.rows.length > 0 && String(result.rows[0]?.alive) === "1";
    return isAlive ? "ok" : "degraded";
  } catch (err) {
    logger.warn({ err, check: "database" }, "Health check failed");
    return "error";
  }
}

async function checkRedis(): Promise<string> {
  try {
    if (!redisClient.isOpen) return "disconnected";
    const pong = await redisClient.ping();
    return pong === "PONG" ? "ok" : "degraded";
  } catch (err) {
    logger.warn({ err, check: "redis" }, "Health check failed");
    return "error";
  }
}

async function checkJwt(): Promise<string> {
  try {
    const testToken = signAccessToken({ sub: "health-check", role: "volunteer", orgId: null });
    verifyAccessToken(testToken);
    return "ok";
  } catch (err) {
    logger.warn({ err, check: "jwt" }, "Health check failed");
    return "error";
  }
}

async function checkStorage(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }), {
        abortSignal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    return "ok";
  } catch (err) {
    logger.warn({ err, check: "storage" }, "Health check failed");
    return "error";
  }
}

async function checkGotenberg(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let gotenbergResponse: Response;
    try {
      gotenbergResponse = await fetch(
        `${env.GOTENBERG_URL.replace(/\/+$/, "")}/health`,
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }
    return gotenbergResponse.ok ? "ok" : "degraded";
  } catch (err) {
    logger.warn({ err, check: "gotenberg" }, "Health check failed");
    return "error";
  }
}

async function checkLivekit(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let lkResponse: Response;
    try {
      const url = new URL(env.LIVEKIT_URL);
      const lkProtocol = url.protocol === "wss:" || url.protocol === "https:" ? "https:" : "http:";
      const lkHealthUrl = `${lkProtocol}//${url.host}/`; // LiveKit typically returns 200 on base route
      lkResponse = await fetch(lkHealthUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    return lkResponse.ok ? "ok" : "degraded";
  } catch (err) {
    logger.warn({ err, check: "livekit" }, "Health check failed");
    return "error";
  }
}

// Deep readiness probe (are dependencies healthy?)
// Used by Docker healthcheck and load balancers
apiRouter.get("/ready", async (_req, res) => {
  const checks: Record<string, string> = {
    database: await checkDatabase(),
    redis: await checkRedis(),
  };
  const healthy = Object.values(checks).every((v) => v === "ok");

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Deep health check — validates all external dependencies and secrets.
// Used by deploy-time smoke tests, not by load balancers (too heavy for per-request).
apiRouter.get("/health/deep", async (_req, res) => {
  const checks: Record<string, string> = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    jwt: await checkJwt(),
    storage: await checkStorage(),
    gotenberg: await checkGotenberg(),
    livekit: await checkLivekit(),
  };
  const healthy = Object.values(checks).every((v) => v === "ok");

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

import { settingsRouter } from "./settings.routes";
import { feedbackRouter } from "./feedback.routes";
import { bugReportRouter } from "./bug-report.routes";
import { notificationRoutes } from "./notification.routes";
import { profileRouter } from "./profile.routes";

apiRouter.use("/auth", authRouter);
apiRouter.use("/share", shareRouter);
apiRouter.use("/rooms", roomRouter);
apiRouter.use("/logs", logRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/event-assignments", eventAssignmentRouter);
apiRouter.use(settingsRouter);
apiRouter.use("/feedback", feedbackRouter);
apiRouter.use("/bug-reports", bugReportRouter);
apiRouter.use("/notifications", notificationRoutes);
apiRouter.use("/profile", profileRouter);
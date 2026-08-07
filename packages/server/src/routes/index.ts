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

// Deep readiness probe (are dependencies healthy?)
// Used by Docker healthcheck and load balancers
apiRouter.get("/ready", async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  // Check PostgreSQL
  try {
    const result = await pool.query("SELECT 1 AS alive");
    const isAlive = result.rows.length > 0 && String(result.rows[0]?.alive) === "1";
    checks.database = isAlive ? "ok" : "degraded";
    if (!isAlive) healthy = false;
  } catch {
    checks.database = "error";
    healthy = false;
  }

  // Check Redis
  try {
    if (redisClient.isOpen) {
      const pong = await redisClient.ping();
      checks.redis = pong === "PONG" ? "ok" : "degraded";
    } else {
      checks.redis = "disconnected";
      healthy = false;
    }
  } catch {
    checks.redis = "error";
    healthy = false;
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Deep health check — validates all external dependencies and secrets.
// Used by deploy-time smoke tests, not by load balancers (too heavy for per-request).
apiRouter.get("/health/deep", async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  // PostgreSQL
  try {
    const result = await pool.query("SELECT 1 AS alive");
    const isAlive = result.rows.length > 0 && String(result.rows[0]?.alive) === "1";
    checks.database = isAlive ? "ok" : "degraded";
    if (!isAlive) healthy = false;
  } catch {
    checks.database = "error";
    healthy = false;
  }

  // Redis
  try {
    if (redisClient.isOpen) {
      const pong = await redisClient.ping();
      checks.redis = pong === "PONG" ? "ok" : "degraded";
    } else {
      checks.redis = "disconnected";
      healthy = false;
    }
  } catch {
    checks.redis = "error";
    healthy = false;
  }

  // JWT signing and verification (validates JWT_SECRET is correct)
  try {
    const testToken = signAccessToken({ sub: "health-check", role: "volunteer", orgId: null });
    verifyAccessToken(testToken);
    checks.jwt = "ok";
  } catch {
    checks.jwt = "error";
    healthy = false;
  }

  // S3/object storage connectivity
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    checks.storage = "ok";
  } catch {
    checks.storage = "error";
    healthy = false;
  }

  // Gotenberg (HTML-to-PDF) connectivity
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const gotenbergResponse = await fetch(
      `${env.GOTENBERG_URL.replace(/\/+$/, "")}/health`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    checks.gotenberg = gotenbergResponse.ok ? "ok" : "degraded";
    if (!gotenbergResponse.ok) healthy = false;
  } catch {
    checks.gotenberg = "error";
    healthy = false;
  }

  // LiveKit connectivity
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    // the LK endpoint could just be a fetch or using LiveKit server-sdk roomServiceClient
    const url = new URL(env.LIVEKIT_URL);
    const lkProtocol = url.protocol === 'wss:' || url.protocol === 'https:' ? 'https:' : 'http:';
    const lkHealthUrl = `${lkProtocol}//${url.host}/`; // Typically LK returns 200 on base route
    
    const lkResponse = await fetch(lkHealthUrl, { signal: controller.signal });
    clearTimeout(timeout);
    // As long as we can reach it, it's fine.
    checks.livekit = lkResponse.ok ? "ok" : "degraded";
    if (!lkResponse.ok) healthy = false;
  } catch {
    checks.livekit = "error";
    healthy = false;
  }

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


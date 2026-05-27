import { Router } from "express";
import { authRouter } from "./auth.routes";
import { roomRouter } from "./room.routes";
import { shareRouter } from "./share.routes";
import { logRouter } from "./log.routes";
import { adminRouter } from "./admin.routes";
import { eventAssignmentRouter } from "./event-assignment.routes";
import { pool } from "../db";

export const apiRouter = Router();

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
    checks.database = result.rows[0]?.alive === 1 ? "ok" : "degraded";
  } catch {
    checks.database = "error";
    healthy = false;
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/share", shareRouter);
apiRouter.use("/rooms", roomRouter);
apiRouter.use("/logs", logRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/event-assignments", eventAssignmentRouter);


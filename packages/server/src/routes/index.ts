import { Router } from "express";
import { authRouter } from "./auth.routes";
import { roomRouter } from "./room.routes";
import { shareRouter } from "./share.routes";
import { logRouter } from "./log.routes";
import { adminRouter } from "./admin.routes";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/share", shareRouter);
apiRouter.use("/rooms", roomRouter);
apiRouter.use("/logs", logRouter);
apiRouter.use("/admin", adminRouter);

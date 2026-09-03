import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { OrgBroadcastSchema } from "@application/shared";
import { redisClient } from "../config/redis";
import { env } from "../config/env";
import { ApiError } from "../utils/errors";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import { listOrgUsers, createUser, deleteUser, sendBroadcast } from "../controllers/admin.controller";
import { CreateUserSchema, DeleteUserSchema } from "../schemas/admin.schemas";

export const adminRouter = Router();

adminRouter.use(requireAuth);

// User management
adminRouter.get("/users", requireRole("admin"), listOrgUsers);
adminRouter.post("/users", requireRole("admin"), validate(CreateUserSchema), createUser);
adminRouter.delete("/users/:id", requireRole("admin"), validate(DeleteUserSchema), deleteUser);

// ── Org broadcast ────────────────────────────────────────────────────────
// One request fans out an in-app row, a web push, and an email for every
// member of the organisation, so this is the most expensive call an
// authenticated user can make and the most damaging to repeat by accident
// (a double-submit mails everyone twice). Admin-only is not sufficient on its
// own — the limiter is the guard against a stuck finger or a retry loop.
//
// Fail-closed, matching auth.routes.ts: with Redis unavailable we cannot know
// how many broadcasts have already gone out, and sending is irreversible, so
// refuse rather than let it through unmetered.
const broadcastLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  store: new RedisStore({
    prefix: "rl:broadcast:",
    sendCommand: async (...args: string[]) => {
      if (!redisClient.isOpen) {
        if (args[0] === "SCRIPT" && args[1] === "LOAD") return "dummy_sha_fallback";
        throw ApiError.internal("Rate limiter unavailable");
      }
      try {
        return await redisClient.sendCommand(args);
      } catch (err) {
        if (String(err).includes("NOSCRIPT")) throw err;
        throw ApiError.internal("Rate limiter unavailable");
      }
    },
  }),
  message: {
    error: "RATE_LIMITED",
    message: "Too many broadcasts sent — try again later",
  },
});

adminRouter.post(
  "/broadcasts",
  requireRole("admin"),
  broadcastLimiter,
  validate(OrgBroadcastSchema),
  sendBroadcast,
);

export default adminRouter;

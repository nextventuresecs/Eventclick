import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { ApiError } from "../utils/errors";
import { validate } from "../middleware/validate";
import { ShareLiveTokenSchema } from "@application/shared";
import {
  getSharedRoom,
  getShareLiveToken,
  getSharePresenceHandler,
} from "../controllers/share.controller";

const createFailClosedStore = (prefix: string) =>
  new RedisStore({
    prefix,
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
  });

const shareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30, // Limit share token requests to prevent enumeration/DDoS
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:share:"),
  message: { error: "RATE_LIMITED", message: "Too many share access attempts — try again later" },
});

export const shareRouter = Router();

shareRouter.use(shareLimiter);

shareRouter.get("/:token", getSharedRoom);
shareRouter.post("/:token/live-token", validate(ShareLiveTokenSchema), getShareLiveToken);
shareRouter.get("/:token/presence", getSharePresenceHandler);

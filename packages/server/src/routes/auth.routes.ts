import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  GoogleLoginSchema,
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  OnboardingSchema,
} from "@application/shared";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { ApiError } from "../utils/errors";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/requireAuth";
import * as authController from "../controllers/auth.controller";

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:auth:"),
  message: { error: "RATE_LIMITED", message: "Too many auth attempts — try again later" },
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 requests per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:recovery:"),
  message: { error: "RATE_LIMITED", message: "Too many password recovery attempts — try again later" },
});

export const authRouter = Router();

authRouter.post("/register", authLimiter, validate(RegisterSchema), authController.register);
authRouter.post("/login", authLimiter, validate(LoginSchema), authController.login);
authRouter.post("/google", authLimiter, validate(GoogleLoginSchema), authController.google);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", requireAuth, authController.me);

authRouter.post("/forgot-password", recoveryLimiter, validate(ForgotPasswordSchema), authController.forgot);
authRouter.post("/reset-password", recoveryLimiter, validate(ResetPasswordSchema), authController.reset);
authRouter.post("/onboarding", requireAuth, validate(OnboardingSchema), authController.onboard);

authRouter.post("/verify-email", recoveryLimiter, authController.verifyEmail);
authRouter.post("/resend-verification", recoveryLimiter, authController.resendVerification);

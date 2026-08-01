import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  GoogleLoginSchema,
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  OnboardingSchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
} from "@application/shared";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { env } from "../config/env";
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
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: Math.max(env.RATE_LIMIT_MAX, 20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:auth:"),
  message: { error: "RATE_LIMITED", message: "Too many auth attempts — try again later" },
});

const recoveryLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: Math.max(5, Math.floor(env.RATE_LIMIT_MAX / 10)),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:recovery:"),
  message: { error: "RATE_LIMITED", message: "Too many password recovery attempts — try again later" },
});

export const authRouter = Router();

import { csrfProtection } from "../middleware/csrf";

authRouter.post("/register", authLimiter, validate(RegisterSchema), authController.register);
authRouter.post("/login", authLimiter, validate(LoginSchema), authController.login);
authRouter.post("/google", authLimiter, validate(GoogleLoginSchema), authController.google);
authRouter.post("/refresh", csrfProtection, authController.refresh);
authRouter.post("/logout", csrfProtection, authController.logout);
authRouter.get("/me", requireAuth, authController.me);
authRouter.patch("/profile", requireAuth, validate(UpdateProfileSchema), authController.updateProfile);
authRouter.post("/change-password", requireAuth, validate(ChangePasswordSchema), authController.changePassword);

authRouter.post("/forgot-password", recoveryLimiter, validate(ForgotPasswordSchema), authController.forgot);
authRouter.post("/reset-password", recoveryLimiter, validate(ResetPasswordSchema), authController.reset);
authRouter.post("/onboarding", requireAuth, validate(OnboardingSchema), authController.onboard);

authRouter.post("/verify-email", recoveryLimiter, authController.verifyEmail);
authRouter.post("/resend-verification", recoveryLimiter, authController.resendVerification);

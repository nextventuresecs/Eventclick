import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import {
  GoogleLoginSchema,
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  OnboardingSchema,
  UpdateProfileSchema,
  ChangePasswordSchema,
  SetPasswordSchema,
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

// Fixed, not derived from RATE_LIMIT_MAX. That variable tunes general API
// throughput; "how many password guesses will we accept" is a policy decision,
// so it lives in code where a reviewer sees it change rather than in an
// environment where a performance tweak can silently switch it off.
//
// The previous values were `Math.max(env.RATE_LIMIT_MAX, 10000)` and
// `Math.max(5, RATE_LIMIT_MAX / 10)`: with the defaults that is 10,000 login
// attempts and 1,000 password-reset attempts per minute. Math.max on a ceiling
// turns it into a floor — no environment value could make either restrictive.
//
// Ten is generous for a human mistyping a password and useless for a machine.
// If support reports genuine lockouts, raise it deliberately with the reason
// written down.
const AUTH_ATTEMPTS_PER_WINDOW = 10;
const RECOVERY_ATTEMPTS_PER_WINDOW = 5;

/**
 * Keyed on the submitted account as well as the client IP.
 *
 * IP alone (the library default) is the wrong dimension here: an attacker with
 * a hundred addresses gets a hundred budgets against one account, while an
 * office behind one NAT gateway shares a single budget between everyone in it.
 * What an attacker is trying to exhaust is an *account*, so that is the key —
 * with the IP as a second dimension, not the only one.
 *
 * Lowercased and trimmed, or changing one letter's case buys a fresh budget.
 * `ipKeyGenerator` normalises IPv6 into a /56 subnet; a bare `req.ip` would let
 * one IPv6 host rotate through addresses it already owns.
 */
export const authRateLimitKey = (req: { body?: unknown; ip?: string }): string => {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const ipKey = req.ip ? ipKeyGenerator(req.ip) : "unknown";
  return email ? `${email}|${ipKey}` : ipKey;
};

// Matches the global limiter in index.ts. Playwright signs in repeatedly, and
// a limit of 10 stops the suite dead — this must ship in the same change as
// the limit, or CI goes red and someone "fixes" it by raising the limit again.
const skipInTests = () => env.NODE_ENV === "test" || process.env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: AUTH_ATTEMPTS_PER_WINDOW,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:auth:"),
  keyGenerator: authRateLimitKey,
  skip: skipInTests,
  message: { error: "RATE_LIMITED", message: "Too many auth attempts — try again later" },
});

const recoveryLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: RECOVERY_ATTEMPTS_PER_WINDOW,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:recovery:"),
  keyGenerator: authRateLimitKey,
  skip: skipInTests,
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
authRouter.post("/set-password", requireAuth, validate(SetPasswordSchema), authController.setPassword);

authRouter.post("/forgot-password", recoveryLimiter, validate(ForgotPasswordSchema), authController.forgot);
authRouter.post("/reset-password", recoveryLimiter, validate(ResetPasswordSchema), authController.reset);
authRouter.post("/onboarding", requireAuth, validate(OnboardingSchema), authController.onboard);

authRouter.post("/verify-email", recoveryLimiter, authController.verifyEmail);
authRouter.post("/resend-verification", recoveryLimiter, authController.resendVerification);

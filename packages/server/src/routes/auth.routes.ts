import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { GoogleLoginSchema, LoginSchema, RegisterSchema } from "@application/shared";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/requireAuth";
import * as authController from "../controllers/auth.controller";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED", message: "Too many auth attempts — try again later" },
});

export const authRouter = Router();

authRouter.post("/register", authLimiter, validate(RegisterSchema), authController.register);
authRouter.post("/login", authLimiter, validate(LoginSchema), authController.login);
authRouter.post("/google", authLimiter, validate(GoogleLoginSchema), authController.google);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", requireAuth, authController.me);

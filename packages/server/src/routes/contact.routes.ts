import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { SubmitContactRequestSchema } from "@application/shared";
import { validate } from "../middleware/validate";
import { createFailClosedStore } from "../middleware/rateLimitStore";
import { env } from "../config/env";
import { submitContactRequest } from "../controllers/contact.controller";

/**
 * The only unauthenticated, side-effecting route on this server.
 *
 * Everything else behind /api/v1 sits behind requireAuth, so the usual
 * per-user accounting does not apply here: an unauthenticated endpoint that
 * sends mail is an open relay for spam unless it is bounded by IP. The global
 * limiter in index.ts is far too generous for that, hence a dedicated, much
 * tighter budget keyed on IP alone — there is no identity to key on.
 */
const CONTACT_REQUESTS_PER_WINDOW = 5;

const contactLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: CONTACT_REQUESTS_PER_WINDOW,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createFailClosedStore("rl:contact:"),
  keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : "unknown"),
  skip: () => env.NODE_ENV === "test" || process.env.NODE_ENV === "test",
  message: {
    error: "RATE_LIMITED",
    message: "Too many requests — please try again later",
  },
});

export const contactRouter = Router();

contactRouter.post(
  "/",
  contactLimiter,
  validate(SubmitContactRequestSchema),
  submitContactRequest,
);

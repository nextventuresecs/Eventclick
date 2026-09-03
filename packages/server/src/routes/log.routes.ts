import { Router, type RequestHandler } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { ClientLogSchema, type ClientLogInput } from "@application/shared";
import { validate } from "../middleware/validate";
import { createFailClosedStore } from "../middleware/rateLimitStore";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * **This endpoint is deliberately public. The justification, since a public
 * write into the log stream needs one:**
 *
 * Its whole purpose is capturing browser crashes, and the most valuable ones
 * happen where no credential exists — a bundle that fails to boot, a crash on
 * the login page, an error during token refresh. Requiring auth would drop
 * exactly the reports worth having.
 *
 * It also *cannot* practically require auth as the client is built. Access
 * tokens live in memory and are attached by the api wrapper; `lib/log.ts`
 * bypasses that wrapper on purpose, preferring `navigator.sendBeacon` so a
 * report survives the page unloading. `sendBeacon` cannot set an
 * `Authorization` header at all. `req.user` is still populated opportunis-
 * tically by `attachUser` when a token happens to be present, and the
 * ingested record carries it — so authenticated reports are attributed
 * without authentication being required.
 *
 * What it must not be is *unbounded*. The mitigations are: a tight
 * Redis-backed budget (below), the size caps in `ClientLogSchema`, and the
 * 1 MB `express.json` body limit.
 */

// Tighter than the client's own throttle (20/min in lib/log.ts), keyed per
// IP. A well-behaved browser never reaches this; anything that does is either
// a bug looping or someone writing into the log stream on purpose. Not derived
// from RATE_LIMIT_MAX — that tunes general API throughput, and this is an
// abuse ceiling.
const LOG_EVENTS_PER_WINDOW = 20;

const logIngestLimiter = rateLimit({
  windowMs: 60_000,
  limit: LOG_EVENTS_PER_WINDOW,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Shared and fail-closed, matching every other limiter in this service. The
  // previous in-process store gave each container its own budget and reset it
  // on every deploy, so the limit did not hold where it mattered.
  store: createFailClosedStore("rl:clientlog:"),
  keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : "unknown"),
  skip: () => env.NODE_ENV === "test" || process.env.NODE_ENV === "test",
  message: { error: "RATE_LIMITED", message: "Too many client log events" },
});

const ingestClientLog: RequestHandler = (req, res) => {
  const input = req.body as ClientLogInput;
  const log = req.log ?? logger;
  const payload = {
    source: "client",
    userId: req.user?.id,
    orgId: req.user?.organizationId,
    clientUrl: input.url,
    userAgent: input.userAgent ?? req.headers["user-agent"],
    stack: input.stack,
    ctx: input.context,
    clientTimestamp: input.timestamp,
  };
  if (input.level === "error") log.error(payload, input.message);
  else if (input.level === "warn") log.warn(payload, input.message);
  else log.info(payload, input.message);
  res.status(204).end();
};

export const logRouter = Router();
logRouter.post("/client-error", logIngestLimiter, validate(ClientLogSchema), ingestClientLog);

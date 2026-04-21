import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { ClientLogSchema, type ClientLogInput } from "@application/shared";
import { validate } from "../middleware/validate";
import { logger } from "../utils/logger";

const logIngestLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
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

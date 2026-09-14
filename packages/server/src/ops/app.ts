import path from "path";
import express, { type RequestHandler } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { nanoid } from "nanoid";
import type { JWTVerifyGetKey } from "jose";
import type { OpsEnv } from "./env";
import type { OpsLogger } from "./logger";
import { createRequireMaintainer, type MaintainerLookup } from "./middleware/requireMaintainer";
import { createRespondAudited, type AuditPool } from "./audit";
import { opsErrorHandler } from "./errors";
import { whoamiRouter } from "./routes/whoami";

export const OPS_API_PREFIX = "/ops-api/v1";

// Cloudflare's ray id is a hex string plus a colo suffix; anything else on the
// docker network could send an arbitrary value, and request_id is varchar(64).
const CF_RAY = /^[A-Za-z0-9-]{1,64}$/;

export interface OpsAppDeps {
  env: Pick<
    OpsEnv,
    "NODE_ENV" | "OPS_AUTH_BYPASS_EMAIL" | "CF_ACCESS_TEAM_DOMAIN" | "CF_ACCESS_AUD" | "OPS_STATIC_DIR" | "SENTRY_RELEASE"
  >;
  readPool: MaintainerLookup;
  auditPool: AuditPool;
  logger: OpsLogger;
  /** Tests only: a local key set in place of the Access JWKS. */
  keys?: JWTVerifyGetKey;
}

export function createOpsApp(deps: OpsAppDeps) {
  const { env, logger } = deps;
  const app = express();

  // ops-server is reached only through cloudflared on the docker network.
  // Nothing upstream is trusted to set X-Forwarded-*.
  app.set("trust proxy", false);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
        },
      },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const ray = req.headers["cf-ray"];
        const id = typeof ray === "string" && CF_RAY.test(ray) ? ray : nanoid(12);
        res.setHeader("x-request-id", id);
        return id;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      autoLogging: { ignore: (req) => (req.url || "").startsWith(`${OPS_API_PREFIX}/healthz`) },
    }),
  );

  app.use(express.json({ limit: "16kb" }));

  app.use("/ops-api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Unauthenticated and unaudited so the container healthcheck and deploy
  // verification can reach it. Returns nothing but its own liveness.
  app.get(`${OPS_API_PREFIX}/healthz`, (_req, res) => {
    res.json({ status: "ok" });
  });

  const requireMaintainer = createRequireMaintainer({
    pool: deps.readPool,
    logger,
    bypassEmail: env.OPS_AUTH_BYPASS_EMAIL,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    audience: env.CF_ACCESS_AUD,
    keys: deps.keys,
  });

  // In-memory store: there is exactly one ops-server instance.
  const limiter: RequestHandler = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.maintainer!.id,
    handler: (_req, res) => {
      res.status(429).json({ error: "RATE_LIMITED" });
    },
  });

  const respondAudited = createRespondAudited({ pool: deps.auditPool, logger });

  const api = express.Router();
  api.use(whoamiRouter({ respondAudited, release: env.SENTRY_RELEASE ?? null }));
  api.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
  });

  app.use(OPS_API_PREFIX, requireMaintainer, limiter, api);
  app.use("/ops-api", (_req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
  });

  // The bundle is gated too: an unauthenticated caller learns nothing about
  // the console, not even its route names.
  const staticDir = path.resolve(env.OPS_STATIC_DIR);
  app.use(requireMaintainer, limiter);
  app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"), (err) => {
      if (err) next(err);
    });
  });

  app.use(opsErrorHandler({ logger, production: env.NODE_ENV === "production" }));

  return app;
}

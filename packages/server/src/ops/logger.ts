import { pino, stdSerializers, type SerializedRequest, type SerializedResponse } from "pino";
import { REDACT_PATHS } from "../utils/redact";
import type { OpsEnv } from "./env";

/**
 * Same redaction and serializers as the tenant logger (utils/logger.ts), which
 * ops-server cannot import because it loads the tenant env. The Access JWT
 * header is added to the redaction list: it is a bearer credential for the
 * maintainer's Access session.
 */
export function createOpsLogger(env: Pick<OpsEnv, "NODE_ENV" | "LOG_LEVEL">) {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: "Eventclick-ops", env: env.NODE_ENV },
    redact: {
      paths: [...REDACT_PATHS, 'req.headers["cf-access-jwt-assertion"]'],
      censor: "[REDACTED]",
    },
    serializers: {
      req(req: SerializedRequest) {
        return {
          id: (req as SerializedRequest & { id?: string }).id,
          method: req.method,
          url: req.url,
        };
      },
      res(res: SerializedResponse) {
        return { statusCode: res.statusCode };
      },
      err: stdSerializers.err,
    },
    ...(env.NODE_ENV === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname,service,env" },
          },
        }
      : {}),
  });
}

export type OpsLogger = ReturnType<typeof createOpsLogger>;

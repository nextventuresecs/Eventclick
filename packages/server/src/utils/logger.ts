import {
  pino,
  stdSerializers,
  type SerializedRequest,
  type SerializedResponse,
} from "pino";
import { env } from "../config/env";
import { REDACT_PATHS, SENSITIVE_FIELD_NAMES } from "./redact";

const defaultLevel =
  env.NODE_ENV === "production"
    ? "info"
    : env.NODE_ENV === "test"
      ? "silent"
      : "debug";

export { REDACT_PATHS, SENSITIVE_FIELD_NAMES };

export const logger = pino({
  level: env.LOG_LEVEL ?? defaultLevel,
  base: { service: "Eventclick-server", env: env.NODE_ENV },
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  serializers: {
    req(req: SerializedRequest) {
      return {
        id: (req as SerializedRequest & { id?: string }).id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res: SerializedResponse) {
      return { statusCode: res.statusCode };
    },
    err: stdSerializers.err,
  },
  ...(env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname,service,env",
            singleLine: false,
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;

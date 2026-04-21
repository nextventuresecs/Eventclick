import { pino, stdSerializers, type SerializedRequest, type SerializedResponse } from "pino";
import { env } from "../config/env";

const defaultLevel =
  env.NODE_ENV === "production" ? "info" : env.NODE_ENV === "test" ? "silent" : "debug";

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  "req.body.password",
  "req.body.idToken",
  "req.body.refreshToken",
  "password",
  "passwordHash",
  "refreshToken",
  "tokenHash",
  "idToken",
  "accessToken",
  "*.password",
  "*.passwordHash",
  "*.tokenHash",
  "*.refreshToken",
  "*.idToken",
  "*.accessToken",
];

export const logger = pino({
  level: env.LOG_LEVEL ?? defaultLevel,
  base: { service: "Evently-server", env: env.NODE_ENV },
  redact: { paths: redactPaths, censor: "[REDACTED]" },
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

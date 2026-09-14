import { ZodError } from "zod";
import type { ErrorRequestHandler } from "express";

const STATEMENT_TIMEOUT = "57014";

/**
 * Last-resort handler for ops-server. Database errors can name tables, columns
 * and values, so production responses carry a code only.
 */
export function opsErrorHandler(deps: {
  logger: { error: (obj: object, msg: string) => void };
  production: boolean;
}): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    // Bad params, query or body parsed with zod in a handler.
    if (err instanceof ZodError) {
      res.status(400).json({ error: "VALIDATION_ERROR" });
      return;
    }

    const code = (err as { code?: unknown }).code;
    if (code === STATEMENT_TIMEOUT) {
      deps.logger.error({ err }, "ops query timed out");
      res.status(504).json({ error: "QUERY_TIMEOUT" });
      return;
    }

    // Malformed or oversize bodies from express.json(), and a missing
    // index.html from sendFile when the frontend was not built.
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const error = status === 404 ? "NOT_FOUND" : status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST";
      res.status(status).json({ error });
      return;
    }

    deps.logger.error({ err }, "ops request failed");
    res
      .status(500)
      .json(deps.production ? { error: "INTERNAL" } : { error: "INTERNAL", message: (err as Error).message });
  };
}

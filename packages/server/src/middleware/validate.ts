import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Source = "body" | "query" | "params";

/**
 * ⚠️ `source: "query"` does not work under Express 5.
 *
 * `req.query` is exposed through a getter that re-derives the object from the
 * query string, so both `req.query = parsed` and in-place mutation are
 * silently discarded — no error, and the handler goes on reading raw,
 * uncoerced strings. Both were verified against express 5.2.1.
 *
 * Parse query parameters inside the handler instead
 * (`MySchema.parse(req.query)`); a ZodError thrown there reaches errorHandler
 * as a 400 exactly as it would from here. See controllers/admin.controller.ts
 * (listAuditLog) for the shape.
 *
 * "body" and "params" are plain properties and are replaced as documented.
 */
export const validate =
  (schema: ZodType, source: Source = "body"): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    (req as unknown as Record<Source, unknown>)[source] = result.data;
    next();
  };

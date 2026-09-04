export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "Forbidden") {
    return new ApiError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, "NOT_FOUND", message);
  }
  static conflict(message: string) {
    return new ApiError(409, "CONFLICT", message);
  }
  static internal(message = "Internal server error") {
    return new ApiError(500, "INTERNAL", message);
  }
  /**
   * An upstream this service depends on did not answer in time. Distinct from
   * `internal` on purpose: the caller can tell "the renderer is slow, retry"
   * from "the report could not be built", and a 504 is retryable in a way a
   * 500 is not.
   */
  static gatewayTimeout(message = "Upstream service timed out") {
    return new ApiError(504, "GATEWAY_TIMEOUT", message);
  }
}

/**
 * True when `error` is (or wraps) a Postgres unique-constraint violation,
 * optionally for one named constraint.
 *
 * Drizzle does not surface driver errors directly: a failed query is rethrown
 * as its own Error whose message is the SQL text, with the pg error hanging
 * off `cause`. So the check has to walk the chain rather than look at the
 * top-level object — see the two stacked exception values on Sentry
 * EVENTCLICK-SERVER-8, where the 23505 is the inner one.
 */
export const isUniqueViolation = (error: unknown, constraint?: string): boolean => {
  let current: unknown = error;
  // Bounded so a self-referential `cause` cannot spin here.
  for (let depth = 0; current != null && depth < 10; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505" && (!constraint || candidate.constraint === constraint)) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
};

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

import { describe, it, expect } from "vitest";
import { ApiError } from "../../utils/errors";

describe("ApiError", () => {
  it("creates a badRequest error with 400 status", () => {
    const err = ApiError.badRequest("Invalid input", { field: "email" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Invalid input");
    expect(err.details).toEqual({ field: "email" });
    expect(err.name).toBe("ApiError");
  });

  it("creates an unauthorized error with 401 status", () => {
    const err = ApiError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Unauthorized");
  });

  it("creates an unauthorized error with custom message", () => {
    const err = ApiError.unauthorized("Token expired");
    expect(err.message).toBe("Token expired");
  });

  it("creates a forbidden error with 403 status", () => {
    const err = ApiError.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("creates a notFound error with 404 status", () => {
    const err = ApiError.notFound("Room not found");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Room not found");
  });

  it("creates a conflict error with 409 status", () => {
    const err = ApiError.conflict("Email already exists");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });

  it("creates an internal error with 500 status", () => {
    const err = ApiError.internal();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("INTERNAL");
    expect(err.message).toBe("Internal server error");
  });

  it("has a proper stack trace", () => {
    const err = ApiError.badRequest("test");
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("ApiError");
  });
});

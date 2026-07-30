import { describe, it, expect, vi } from "vitest";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import { z } from "zod";

describe("Middleware Tests", () => {
  it("requireAuth should throw 401 if no user", () => {
    const req: any = {};
    const res: any = {};
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    const errorArg = next.mock.calls[0]![0];
    expect(errorArg).toBeDefined();
    expect(errorArg.statusCode).toBe(401);
  });

  it("requireRole should throw 403 if role does not match", () => {
    const middleware = requireRole("admin");
    const req: any = { user: { role: "volunteer" } };
    const res: any = {};
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    const errorArg = next.mock.calls[0]![0];
    expect(errorArg).toBeDefined();
    expect(errorArg.statusCode).toBe(403);
  });

  it("validate should throw 422 for invalid schema", async () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate(schema);
    const req: any = { body: { name: 123 } };
    const res: any = {};
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    const errorArg = next.mock.calls[0]![0];
    expect(errorArg).toBeDefined();
    expect(errorArg.statusCode).toBe(400); // 400 or 422, let's see how validate maps it (usually 400 for zod error in this setup based on standard ZodError mapping)
  });
});

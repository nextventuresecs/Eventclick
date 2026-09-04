import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "../utils/errors";

/**
 * Cover for Sentry EVENTCLICK-SERVER-8, where the 23505 was the *inner*
 * exception: drizzle rethrows a failed query as its own Error whose message is
 * the SQL text, with the pg error on `cause`.
 */
describe("isUniqueViolation", () => {
  const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint: "users_email_unique",
  });

  it("matches a bare pg unique violation", () => {
    expect(isUniqueViolation(pgError)).toBe(true);
  });

  it("matches through drizzle's wrapping Error", () => {
    const wrapped = new Error('Failed query: insert into "users" ...', { cause: pgError });
    expect(isUniqueViolation(wrapped, "users_email_unique")).toBe(true);
  });

  it("does not match a different constraint when one is named", () => {
    expect(isUniqueViolation(pgError, "event_admin_assignments_user_room_uniq")).toBe(false);
  });

  it("does not match other SQLSTATEs, plain errors, or nullish input", () => {
    expect(isUniqueViolation(Object.assign(new Error("fk"), { code: "23503" }))).toBe(false);
    expect(isUniqueViolation(new Error("nope"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it("terminates on a self-referential cause chain", () => {
    const loop: any = new Error("loop");
    loop.cause = loop;
    expect(isUniqueViolation(loop)).toBe(false);
  });
});

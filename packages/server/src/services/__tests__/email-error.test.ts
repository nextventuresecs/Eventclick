import { describe, it, expect } from "vitest";
import { z } from "zod";
import { describeEmailError, isPermanentEmailError } from "../email-error";

// Shapes as the Resend SDK (6.x) returns them. The senders rethrow these plain
// objects, which are not Error instances. The 401 below is what a real call
// with an invalid API key returned.
const resend = (name: string, statusCode: number | null, message = "m") => ({ name, statusCode, message });

describe("isPermanentEmailError", () => {
  it("fails fast on ZodError: payload validation failed", () => {
    const schema = z.object({ token: z.string() });
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(isPermanentEmailError(parsed.error)).toBe(true);
    }
  });

  it.for([
    ["validation_error", 422],
    ["validation_error", 400],
    ["missing_required_field", 422],
    ["invalid_parameter", 422],
    ["invalid_attachment", 422],
  ] as const)("fails fast on %s %s: the request itself is wrong", ([name, status]) => {
    expect(isPermanentEmailError(resend(name, status))).toBe(true);
  });

  it.for([
    ["validation_error", 401, "invalid API key"],
    ["validation_error", 403, "unverified sending domain"],
    ["invalid_api_key", 403, "our configuration"],
    ["missing_api_key", 401, "our configuration"],
    ["restricted_api_key", 401, "our configuration"],
    ["invalid_from_address", 422, "our RESEND_FROM_EMAIL"],
    ["rate_limit_exceeded", 429, "transient"],
    ["daily_quota_exceeded", 429, "clears tomorrow"],
    ["application_error", 500, "provider fault"],
    ["internal_server_error", 500, "provider fault"],
    ["application_error", null, "request never reached Resend"],
    ["validation_error", null, "no status to go on"],
  ] as const)("retries %s %s (%s)", ([name, status]) => {
    expect(isPermanentEmailError(resend(name, status))).toBe(false);
  });

  it.for([new TypeError("fetch failed"), new Error("connection terminated"), "boom", null, undefined, { message: "no name" }])(
    "retries anything that is not a provider error (%s)",
    (err) => {
      expect(isPermanentEmailError(err)).toBe(false);
    },
  );
});

describe("describeEmailError", () => {
  it("formats ZodError cleanly", () => {
    const schema = z.object({ token: z.string() });
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeEmailError(parsed.error)).toContain("Invalid email payload (ZodError): token:");
    }
  });

  it("keeps the provider's name, status and message", () => {
    expect(describeEmailError(resend("validation_error", 422, "Invalid `to` field."))).toBe(
      "validation_error 422: Invalid `to` field.",
    );
  });

  it("omits a missing status", () => {
    expect(describeEmailError(resend("application_error", null, "Unable to fetch data."))).toBe(
      "application_error: Unable to fetch data.",
    );
  });

  it("uses an Error's message, and stringifies anything else", () => {
    expect(describeEmailError(new Error("connection terminated"))).toBe("connection terminated");
    expect(describeEmailError("boom")).toBe("boom");
  });
});

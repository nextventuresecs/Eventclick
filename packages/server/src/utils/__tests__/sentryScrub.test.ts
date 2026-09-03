import { describe, it, expect } from "vitest";
import { scrubSensitive, SCRUB_PLACEHOLDER } from "../sentryScrub";
import { REDACT_PATHS, SENSITIVE_FIELD_NAMES } from "../logger";

describe("Sentry outbound scrubbing (#83)", () => {
  it("redacts a submitted password wherever the SDK nests it", () => {
    // The same secret appears under different shapes depending on how the
    // event was captured, which is why the match is on field name, not path.
    const event = {
      request: { data: { email: "a@b.com", password: "hunter2" } },
      contexts: { state: { password: "hunter2" } },
      extra: { body: { password: "hunter2" } },
    };

    const scrubbed = scrubSensitive(event);

    expect(scrubbed.request.data.password).toBe(SCRUB_PLACEHOLDER);
    expect(scrubbed.contexts.state.password).toBe(SCRUB_PLACEHOLDER);
    expect(scrubbed.extra.body.password).toBe(SCRUB_PLACEHOLDER);
    // Non-sensitive fields survive — a scrubbed event still has to be useful.
    expect(scrubbed.request.data.email).toBe("a@b.com");
  });

  it("redacts tokens and hashes, not just passwords", () => {
    const scrubbed = scrubSensitive({
      refreshToken: "rt_live_abc",
      tokenHash: "sha256:...",
      accessToken: "eyJ...",
      idToken: "google-id-token",
      passwordHash: "$argon2id$...",
    });

    for (const value of Object.values(scrubbed)) {
      expect(value).toBe(SCRUB_PLACEHOLDER);
    }
  });

  it("matches field names case-insensitively", () => {
    const scrubbed = scrubSensitive({ Password: "hunter2", REFRESHTOKEN: "rt" });

    expect(scrubbed.Password).toBe(SCRUB_PLACEHOLDER);
    expect(scrubbed.REFRESHTOKEN).toBe(SCRUB_PLACEHOLDER);
  });

  it("walks arrays as well as objects", () => {
    const scrubbed = scrubSensitive({ users: [{ email: "a@b.com", password: "p" }] });

    expect(scrubbed.users[0]!.password).toBe(SCRUB_PLACEHOLDER);
    expect(scrubbed.users[0]!.email).toBe("a@b.com");
  });

  it("survives a cyclic object rather than recursing forever", () => {
    // Captured context can reference itself — an Express req pointing at its
    // res, for instance.
    const cyclic: Record<string, unknown> = { password: "p" };
    cyclic.self = cyclic;

    expect(() => scrubSensitive(cyclic)).not.toThrow();
    expect(scrubSensitive(cyclic).password).toBe(SCRUB_PLACEHOLDER);
  });

  it("leaves primitives and nullish values alone", () => {
    expect(scrubSensitive("plain")).toBe("plain");
    expect(scrubSensitive(42)).toBe(42);
    expect(scrubSensitive(null)).toBe(null);
    expect(scrubSensitive(undefined)).toBe(undefined);
  });

  it("derives its field list from the logger's, so the two cannot drift", () => {
    // The guarantee the AC asks for: adding a path to REDACT_PATHS protects
    // the Sentry payload automatically, with no second list to remember.
    expect(SENSITIVE_FIELD_NAMES).toContain("password");
    expect(SENSITIVE_FIELD_NAMES).toContain("tokenhash");
    expect(SENSITIVE_FIELD_NAMES).not.toContain("*");

    for (const path of REDACT_PATHS) {
      const leaf = path.split(".").pop()!.replace(/^\[?"?/, "").replace(/"?\]?$/, "").toLowerCase();
      if (leaf && leaf !== "*") expect(SENSITIVE_FIELD_NAMES).toContain(leaf);
    }
  });
});

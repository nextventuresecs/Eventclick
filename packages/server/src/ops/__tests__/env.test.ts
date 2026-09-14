import { describe, it, expect, vi, afterEach } from "vitest";
import { loadOpsEnv, parseOpsEnv } from "../env";

const base = {
  MAINTAINER_RO_DATABASE_URL: "postgresql://maintainer_ro_login:x@localhost:5432/db",
  MAINTAINER_AUDIT_DATABASE_URL: "postgresql://maintainer_audit_login:x@localhost:5432/db",
  CF_ACCESS_TEAM_DOMAIN: "https://nvces.cloudflareaccess.com/",
  CF_ACCESS_AUD: "aud-tag",
};

afterEach(() => vi.restoreAllMocks());

describe("ops env", () => {
  it("refuses to start in production with the auth bypass set", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      loadOpsEnv({ ...base, NODE_ENV: "production", OPS_AUTH_BYPASS_EMAIL: "x@y.z" }),
    ).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(error.mock.calls.flat().join(" ")).toContain(
      "OPS_AUTH_BYPASS_EMAIL must never be set in production",
    );
  });

  it("allows the bypass outside production and then does not need Cloudflare settings", () => {
    const result = parseOpsEnv({
      NODE_ENV: "development",
      MAINTAINER_RO_DATABASE_URL: base.MAINTAINER_RO_DATABASE_URL,
      MAINTAINER_AUDIT_DATABASE_URL: base.MAINTAINER_AUDIT_DATABASE_URL,
      OPS_AUTH_BYPASS_EMAIL: " Dev@Example.com ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.OPS_AUTH_BYPASS_EMAIL).toBe("dev@example.com");
  });

  it("requires Cloudflare settings when the bypass is absent", () => {
    const result = parseOpsEnv({
      MAINTAINER_RO_DATABASE_URL: base.MAINTAINER_RO_DATABASE_URL,
      MAINTAINER_AUDIT_DATABASE_URL: base.MAINTAINER_AUDIT_DATABASE_URL,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors)).toEqual(
        expect.arrayContaining(["CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD"]),
      );
    }
  });

  it("applies defaults and strips the team domain's trailing slash", () => {
    const result = parseOpsEnv({ ...base, NODE_ENV: "production" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.OPS_PORT).toBe(4100);
    expect(result.data.CF_ACCESS_TEAM_DOMAIN).toBe("https://nvces.cloudflareaccess.com");
    expect(result.data.OPS_STATIC_DIR).toBe("packages/ops/dist");
    expect(result.data.LOG_LEVEL).toBe("info");
    expect(result.data.SENTRY_RELEASE).toBeUndefined();
    expect(result.data.OPS_APP_INTERNAL_URL).toBe("http://server:4000");
    expect(result.data.AWS_REGION).toBe("ap-south-1");
    expect(result.data.OPS_SQS_DLQ_URL).toBeUndefined();
    expect(result.data.OPS_SENTRY_ORG_URL).toBeUndefined();
  });

  it("reads the health probe settings, treating blanks as unset", () => {
    const result = parseOpsEnv({
      ...base,
      OPS_APP_INTERNAL_URL: "http://server:4000/",
      OPS_SQS_DLQ_URL: " ",
      OPS_SENTRY_ORG_URL: "https://nvces.sentry.io/",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.OPS_APP_INTERNAL_URL).toBe("http://server:4000");
    expect(result.data.OPS_SQS_DLQ_URL).toBeUndefined();
    expect(result.data.OPS_SENTRY_ORG_URL).toBe("https://nvces.sentry.io");
  });
});

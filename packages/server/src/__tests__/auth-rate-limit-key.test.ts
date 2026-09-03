import { describe, it, expect } from "vitest";
import { authRateLimitKey } from "../routes/auth.routes";

describe("auth rate limit key (#79)", () => {
  it("scopes the budget to the account, not just the caller's IP", () => {
    // One IP spraying two accounts gets two budgets; ten guesses against one
    // account is the thing being bounded.
    const a = authRateLimitKey({ body: { email: "victim@example.com" }, ip: "203.0.113.5" });
    const b = authRateLimitKey({ body: { email: "someone@example.com" }, ip: "203.0.113.5" });

    expect(a).not.toBe(b);
    expect(a).toContain("victim@example.com");
  });

  it("keeps one account's budget shared across many IPs", () => {
    // The mirror case: a botnet cannot buy a fresh budget per address.
    const fromOne = authRateLimitKey({ body: { email: "victim@example.com" }, ip: "203.0.113.5" });
    const fromAnother = authRateLimitKey({ body: { email: "victim@example.com" }, ip: "198.51.100.9" });

    expect(fromOne.split("|")[0]).toBe(fromAnother.split("|")[0]);
  });

  it("treats casing and surrounding whitespace as the same account", () => {
    // Otherwise changing one letter's case buys a fresh budget.
    const plain = authRateLimitKey({ body: { email: "victim@example.com" }, ip: "203.0.113.5" });
    const shouted = authRateLimitKey({ body: { email: "  Victim@Example.COM " }, ip: "203.0.113.5" });

    expect(shouted).toBe(plain);
  });

  it("falls back to the IP when no email was submitted", () => {
    const key = authRateLimitKey({ body: {}, ip: "203.0.113.5" });

    expect(key).not.toContain("|");
    expect(key).toContain("203.0.113.5");
  });

  it("survives a body that is missing or the wrong shape", () => {
    expect(authRateLimitKey({ ip: "203.0.113.5" })).toContain("203.0.113.5");
    expect(authRateLimitKey({ body: { email: 42 }, ip: "203.0.113.5" })).toContain("203.0.113.5");
    expect(authRateLimitKey({})).toBe("unknown");
  });

  it("normalises IPv6 so one host cannot rotate through its own addresses", () => {
    const first = authRateLimitKey({ body: { email: "victim@example.com" }, ip: "2001:db8::1" });
    const second = authRateLimitKey({ body: { email: "victim@example.com" }, ip: "2001:db8::2" });

    expect(first).toBe(second);
  });
});

import { describe, it, expect, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ scored: [] as string[] }));

vi.mock("zxcvbn", () => ({
  default: (input: string) => {
    hoisted.scored.push(input);
    // Stand-in for the real scorer: anything containing "weak" is rejected.
    return input.includes("weak")
      ? { score: 1, feedback: { warning: "This is a top-10 common password" } }
      : { score: 4, feedback: { warning: "" } };
  },
}));

import {
  assertPasswordStrength,
  MAX_SCORED_PASSWORD_CHARS,
  MIN_PASSWORD_SCORE,
} from "../passwordStrength";

describe("password strength scoring (#88 — attacker-controlled CPU)", () => {
  it("never scores more than the capped prefix", () => {
    // The DoS was that the attacker chose the input length: zxcvbn's cost is
    // superlinear, and PasswordSchema allows 128 characters — measured at
    // ~150ms of blocked event loop per request.
    hoisted.scored.length = 0;

    assertPasswordStrength("A1!".repeat(50));

    expect(hoisted.scored[0]!.length).toBe(MAX_SCORED_PASSWORD_CHARS);
  });

  it("passes a short password through untruncated", () => {
    hoisted.scored.length = 0;

    assertPasswordStrength("Sh0rt!pass");

    expect(hoisted.scored[0]).toBe("Sh0rt!pass");
  });

  it("keeps the threshold users experience", () => {
    expect(MIN_PASSWORD_SCORE).toBe(3);
    expect(() => assertPasswordStrength("weakpassword")).toThrow(/too weak/i);
  });

  it("surfaces the scorer's own feedback when it has any", () => {
    expect(() => assertPasswordStrength("weakpassword")).toThrow(/top-10 common password/);
  });

  it("accepts a strong password", () => {
    expect(() => assertPasswordStrength("Tr0ub4dor&3xKq7Z")).not.toThrow();
  });

  it("rejects a weak prefix even when strong material follows", () => {
    // Truncation can only make the rules stricter, never weaker: a prefix at
    // or above the threshold guarantees the full string is too.
    expect(() => assertPasswordStrength(`${"weak".repeat(8)}Tr0ub4dor&3xKq7Z`)).toThrow(/too weak/i);
  });
});

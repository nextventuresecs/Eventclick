import { describe, it, expect } from "vitest";
import { emailRetryDelaySeconds } from "../emailBackoff";

const noJitter = () => 0;

describe("emailRetryDelaySeconds", () => {
  it.for([
    ["1", 30],
    ["2", 120],
    ["3", 300],
    ["4", 900],
    ["8", 900],
    ["40", 900],
  ] as const)("waits the scheduled delay after receive %s", ([count, seconds]) => {
    expect(emailRetryDelaySeconds(count, noJitter)).toBe(seconds);
  });

  it("accepts the count as a number", () => {
    expect(emailRetryDelaySeconds(2, noJitter)).toBe(120);
  });

  // SQS omits the attribute unless the receive asks for it; a NaN visibility
  // timeout would be rejected and the backoff silently lost.
  it.for([undefined, "", "abc", "0", "-3", "1.5"])("treats an unreadable count (%s) as the first receive", (count) => {
    expect(emailRetryDelaySeconds(count, noJitter)).toBe(30);
  });

  it("adds at most 20% jitter, as whole seconds", () => {
    expect(emailRetryDelaySeconds("1", () => 0.999999)).toBe(36);
    expect(emailRetryDelaySeconds("4", () => 0.5)).toBe(990);
    expect(Number.isInteger(emailRetryDelaySeconds("3"))).toBe(true);
  });

  it("stays far below the SQS visibility limit of 12 hours", () => {
    expect(emailRetryDelaySeconds("1000", () => 0.999999)).toBeLessThanOrEqual(43_200);
  });
});

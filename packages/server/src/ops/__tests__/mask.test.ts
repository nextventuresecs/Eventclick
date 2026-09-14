import { describe, it, expect } from "vitest";
import { maskEmail, maskName } from "../mask";

describe("maskEmail", () => {
  it.each([
    ["jane.doe@example.org", "ja***@e***.org"],
    ["j@example.org", "j***@e***.org"],
    ["jo@example.org", "j***@e***.org"],
    ["jane@mail.example.co.uk", "ja***@m***.uk"],
    ["not-an-email", "***"],
    ["Jane.Doe@Example.ORG", "ja***@e***.org"],
  ])("%s → %s", (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it("never returns more of the address than the rule allows", () => {
    expect(maskEmail("@example.org")).toBe("***");
    expect(maskEmail("jane@")).toBe("***");
    expect(maskEmail("jane@localhost")).toBe("ja***@l***");
  });
});

describe("maskName", () => {
  it.each([
    ["Jane Doe", "J. D."],
    ["Jane", "J."],
    ["jane mary ann doe", "J. M. A."],
    ["  Jane    Doe  ", "J. D."],
    ["", "***"],
  ])("%j → %s", (input, expected) => {
    expect(maskName(input)).toBe(expected);
  });
});

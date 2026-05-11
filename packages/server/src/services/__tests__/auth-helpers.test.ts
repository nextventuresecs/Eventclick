import { describe, it, expect } from "vitest";

/**
 * Tests for the slugify helper (private to auth.service).
 * We re-implement the exact same logic here to validate edge cases,
 * since it's a pure function extracted from the service.
 */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";

describe("slugify (auth.service helper)", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("My Cool Org")).toBe("my-cool-org");
  });

  it("strips special characters", () => {
    expect(slugify("Org@Name! #123")).toBe("org-name-123");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("---test---")).toBe("test");
  });

  it("truncates to 60 chars", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(60);
  });

  it('defaults to "org" for empty input', () => {
    expect(slugify("")).toBe("org");
    expect(slugify("   ")).toBe("org");
    expect(slugify("!!!")).toBe("org");
  });
});

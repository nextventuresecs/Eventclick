import { describe, it, expect } from "vitest";
import { classifyQuery, searchQuerySha256 } from "../search";
import { createHash } from "crypto";

describe("classifyQuery", () => {
  it("treats a UUID as a user-or-org id, lowercased", () => {
    expect(classifyQuery("7D5B3C1E-0000-4000-8000-000000000001")).toEqual({
      kind: "id",
      value: "7d5b3c1e-0000-4000-8000-000000000001",
    });
  });

  it("treats anything with @ as an exact email, lowercased", () => {
    expect(classifyQuery("  Jane.Doe@Example.org ")).toEqual({ kind: "email", value: "jane.doe@example.org" });
  });

  it("treats a mixed-case 8-64 char token as a request id only", () => {
    expect(classifyQuery("gmcX35BZ_aHB")).toEqual({ kind: "request", value: "gmcX35BZ_aHB" });
  });

  it("treats a short lowercase token as a slug only", () => {
    expect(classifyQuery("acme")).toEqual({ kind: "slug", value: "acme" });
  });

  it("marks a string that fits both slug and request id as a tie for the resolver", () => {
    expect(classifyQuery("acme-foundation")).toEqual({ kind: "slugOrRequest", value: "acme-foundation" });
  });

  it("returns none for anything else", () => {
    expect(classifyQuery("acme foundation")).toEqual({ kind: "none" });
    expect(classifyQuery("x".repeat(101))).toEqual({ kind: "none" });
    expect(classifyQuery("Acme")).toEqual({ kind: "none" });
  });

  it("hashes the lowercased trimmed term for the audit log", () => {
    expect(searchQuerySha256(" Jane@Example.org ")).toBe(
      createHash("sha256").update("jane@example.org").digest("hex"),
    );
  });
});

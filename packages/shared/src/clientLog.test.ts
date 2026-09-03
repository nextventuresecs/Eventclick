import { describe, it, expect } from "vitest";
import {
  ClientLogSchema,
  MAX_CLIENT_LOG_CONTEXT_KEYS,
  MAX_CLIENT_LOG_CONTEXT_BYTES,
} from "./index";

const base = { level: "error" as const, message: "boom" };

describe("ClientLogSchema size caps (#86 — the endpoint is public)", () => {
  it("accepts an ordinary client error report", () => {
    expect(
      ClientLogSchema.safeParse({
        ...base,
        stack: "Error: boom\n  at foo",
        url: "https://app.example.com/rooms/1",
        context: { roomId: "abc", attempt: 2 },
      }).success,
    ).toBe(true);
  });

  it("rejects a context with too many keys", () => {
    const context = Object.fromEntries(
      Array.from({ length: MAX_CLIENT_LOG_CONTEXT_KEYS + 1 }, (_, i) => [`k${i}`, 1]),
    );

    expect(ClientLogSchema.safeParse({ ...base, context }).success).toBe(false);
  });

  it("rejects a context that serialises past the byte cap", () => {
    // Previously unbounded: one request could carry just under the 1 MB body
    // limit of arbitrary JSON straight into the log stream.
    const context = { blob: "x".repeat(MAX_CLIENT_LOG_CONTEXT_BYTES + 1) };

    expect(ClientLogSchema.safeParse({ ...base, context }).success).toBe(false);
  });

  it("rejects an unserialisable context rather than letting the logger throw", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(ClientLogSchema.safeParse({ ...base, context: cyclic }).success).toBe(false);
  });

  it("still caps the fields that were already capped", () => {
    expect(ClientLogSchema.safeParse({ ...base, message: "x".repeat(2001) }).success).toBe(false);
    expect(ClientLogSchema.safeParse({ ...base, stack: "x".repeat(8001) }).success).toBe(false);
    expect(ClientLogSchema.safeParse({ ...base, url: "x".repeat(501) }).success).toBe(false);
  });

  it("rejects an over-long context key", () => {
    expect(
      ClientLogSchema.safeParse({ ...base, context: { ["k".repeat(65)]: 1 } }).success,
    ).toBe(false);
  });
});

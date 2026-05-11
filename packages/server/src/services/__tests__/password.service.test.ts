import { describe, it, expect, vi } from "vitest";

// Mock env before importing the module under test
vi.mock("../../config/env", () => ({
  env: {
    BCRYPT_ROUNDS: 10,
  },
}));

import { hashPassword, verifyPassword } from "../password.service";

describe("password.service", () => {
  it("hashes a password into a bcrypt string", async () => {
    const hash = await hashPassword("MyP@ssw0rd!");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    expect(hash).not.toBe("MyP@ssw0rd!");
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    const ok = await verifyPassword("correct-horse-battery", hash);
    expect(ok).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    const ok = await verifyPassword("wrong-password", hash);
    expect(ok).toBe(false);
  });

  it("produces different hashes for the same input (salt)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });
});

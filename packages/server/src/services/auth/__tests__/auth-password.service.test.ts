import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "../../../utils/errors";

let mockUserRow: any = null;
const mockUpdateSet = vi.fn();

vi.mock("../../../db", () => ({
  authDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockUserRow ? [mockUserRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (values: any) => {
        mockUpdateSet(values);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
  },
}));

vi.mock("argon2", () => ({
  default: { hash: vi.fn().mockResolvedValue("new-hashed-password") },
}));

vi.mock("../auth-helpers", () => ({
  invalidateUserCache: vi.fn().mockResolvedValue(undefined),
}));

import { setInitialPassword } from "../auth-password.service";

describe("setInitialPassword (#70 — first-time password setup for USER_INVITED)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRow = null;
  });

  it("throws notFound when the user doesn't exist", async () => {
    mockUserRow = null;
    await expect(setInitialPassword("ghost-user", "Sup3r$ecret!")).rejects.toThrow(ApiError.notFound("User not found"));
  });

  it("throws conflict when the user already has a password", async () => {
    mockUserRow = { id: "user-1", passwordHash: "already-set" };
    await expect(setInitialPassword("user-1", "Sup3r$ecret!")).rejects.toThrow(/Password already set/);
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("rejects a weak password", async () => {
    mockUserRow = { id: "user-1", passwordHash: null };
    await expect(setInitialPassword("user-1", "123456")).rejects.toThrow(/too weak/);
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("sets the password when passwordHash is currently null", async () => {
    mockUserRow = { id: "user-1", passwordHash: null };
    await setInitialPassword("user-1", "Sup3r$ecret!");
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: "new-hashed-password" }));
  });
});

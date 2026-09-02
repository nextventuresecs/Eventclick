import { describe, it, expect, vi, beforeEach } from "vitest";

// logoutSession is the one place a pre-existing auth path gained notification
// behaviour (#76), so it is tested on its own rather than through the whole
// login service. Everything it touches besides the session lookup is mocked.

let mockSession: any = null;
const mockRevokeSession = vi.fn().mockResolvedValue(undefined);

vi.mock("../../session.service", () => ({
  findSessionByToken: () => mockFindSessionByToken(),
  revokeSession: (...args: unknown[]) => mockRevokeSession(...args),
  rotateSession: vi.fn(),
}));
const mockFindSessionByToken = vi.fn(async () => mockSession);

let mockActiveRoom: { roomId: string; organizationId: string } | null = null;
const mockNotifyUserLeftEvent = vi.fn();
const mockForgetActiveRoom = vi.fn().mockResolvedValue(undefined);
vi.mock("../../user-left-notification.service", () => ({
  readActiveRoom: async () => mockActiveRoom,
  forgetActiveRoom: (...args: unknown[]) => mockForgetActiveRoom(...args),
  notifyUserLeftEvent: (...args: unknown[]) => mockNotifyUserLeftEvent(...args),
}));

vi.mock("../../../db", () => ({ authDb: {}, db: {} }));
vi.mock("../../google.service", () => ({ verifyGoogleIdToken: vi.fn() }));
vi.mock("../../jwt.service", () => ({ signAccessToken: vi.fn() }));
vi.mock("../auth-helpers", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  invalidateUserCache: vi.fn(),
  issueTokensFor: vi.fn(),
  toAuthUser: vi.fn(),
}));

import { logoutSession } from "../auth-login.service";

describe("logoutSession — USER_LEFT_EVENT on session termination (#76)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { id: "session-1", userId: "user-1", revokedAt: null };
    mockActiveRoom = { roomId: "room-1", organizationId: "org-1" };
  });

  it("emits the logged_out variant for the room the user was in, and clears it", async () => {
    await logoutSession("refresh-token");

    expect(mockRevokeSession).toHaveBeenCalledWith("session-1");
    expect(mockForgetActiveRoom).toHaveBeenCalledWith("user-1");
    expect(mockNotifyUserLeftEvent).toHaveBeenCalledWith("room-1", "org-1", "user-1", "logged_out");
  });

  it("emits nothing when the user was not in a room (or Redis is down)", async () => {
    mockActiveRoom = null;

    await logoutSession("refresh-token");

    expect(mockRevokeSession).toHaveBeenCalledWith("session-1");
    expect(mockNotifyUserLeftEvent).not.toHaveBeenCalled();
    expect(mockForgetActiveRoom).not.toHaveBeenCalled();
  });

  it("emits nothing when there is no refresh token at all", async () => {
    await logoutSession(undefined);

    expect(mockRevokeSession).not.toHaveBeenCalled();
    expect(mockNotifyUserLeftEvent).not.toHaveBeenCalled();
  });

  it("emits nothing when the session was already revoked — a replayed logout", async () => {
    mockSession = { id: "session-1", userId: "user-1", revokedAt: new Date() };

    await logoutSession("refresh-token");

    expect(mockRevokeSession).not.toHaveBeenCalled();
    expect(mockNotifyUserLeftEvent).not.toHaveBeenCalled();
  });
});

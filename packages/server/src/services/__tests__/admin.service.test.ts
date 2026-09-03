import { describe, it, expect, vi, beforeEach } from "vitest";

let selectCallCount = 0;
let duplicateCheckResult: any[] = [];
let orgLookupResult: any[] = [{ name: "Acme Org" }];
let insertedUserValues: any = null;
const insertedOrgMemberValues: any[] = [];
const insertedEmailVerificationValues: any[] = [];

vi.mock("../../db", () => ({
  db: {
    select: () => {
      const callNum = ++selectCallCount;
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(callNum === 1 ? duplicateCheckResult : orgLookupResult),
          }),
        }),
      };
    },
  },
  authDb: {
    transaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        insert: (table: string) => ({
          values: (values: any) => {
            if (table === "users-table") {
              insertedUserValues = values;
              return { returning: () => Promise.resolve([{ id: "new-user-1", email: values.email, preferences: null }]) };
            }
            if (table === "org-members-table") {
              insertedOrgMemberValues.push(values);
              return Promise.resolve(undefined);
            }
            insertedEmailVerificationValues.push(values);
            return Promise.resolve(undefined);
          },
        }),
      };
      return fn(tx);
    },
  },
}));

vi.mock("../../db/schema", async () => {
  const actual = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    ...actual,
    users: "users-table",
    orgMembers: "org-members-table",
    emailVerifications: "email-verifications-table",
    organizations: "organizations-table",
  };
});

vi.mock("argon2", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
}));

const mockDispatchEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../email-delivery.service", () => ({
  dispatchEmail: (...args: unknown[]) => mockDispatchEmail(...args),
}));

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("../notification.service", () => ({
  notificationService: { createNotification: (...args: unknown[]) => mockCreateNotification(...args) },
}));

vi.mock("../auth", () => ({
  invalidateUserCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../audit.service", () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
  // createOrgUser records user.created through the non-throwing wrapper (#92).
  recordAuditSafely: vi.fn().mockResolvedValue(undefined),
}));

import { createOrgUser } from "../admin.service";

describe("admin.service.createOrgUser — USER_INVITED routing (#70)", () => {
  beforeEach(() => {
    selectCallCount = 0;
    duplicateCheckResult = [];
    orgLookupResult = [{ name: "Acme Org" }];
    insertedUserValues = null;
    insertedOrgMemberValues.length = 0;
    insertedEmailVerificationValues.length = 0;
    mockDispatchEmail.mockClear();
    mockCreateNotification.mockClear();
  });

  it("creates the user with no password when the admin omits one", async () => {
    await createOrgUser("org-1", "admin-1", {
      email: "invitee@test.com",
      fullName: "Invitee",
      role: "volunteer",
    } as any);

    expect(insertedUserValues.passwordHash).toBeNull();
  });

  it("hashes and stores the admin-provided password when given", async () => {
    await createOrgUser("org-1", "admin-1", {
      email: "invitee@test.com",
      fullName: "Invitee",
      password: "Sup3r$ecret!",
      role: "volunteer",
    } as any);

    expect(insertedUserValues.passwordHash).toBe("hashed-password");
  });

  it("dispatches exactly one invite email — not the old verification type", async () => {
    await createOrgUser("org-1", "admin-1", {
      email: "invitee@test.com",
      fullName: "Invitee",
      role: "volunteer",
    } as any);

    expect(mockDispatchEmail).toHaveBeenCalledTimes(1);
    expect(mockDispatchEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invite", recipientEmail: "invitee@test.com" }),
    );
    expect(mockDispatchEmail.mock.calls[0]?.[0].payload).toMatchObject({ orgName: "Acme Org" });
  });

  it("creates a USER_INVITED in-app notification without leaking the raw token in metadata", async () => {
    await createOrgUser("org-1", "admin-1", {
      email: "invitee@test.com",
      fullName: "Invitee",
      role: "volunteer",
    } as any);

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    const call = mockCreateNotification.mock.calls[0]?.[0];
    expect(call.type).toBe("USER_INVITED");
    expect(call.metadata).not.toHaveProperty("inviteToken");
    expect(JSON.stringify(call.metadata ?? {})).not.toMatch(/[0-9a-f]{64}/);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown> | undefined>,
  signed: [] as { key: string; ttl: number }[],
}));

vi.mock("../../db/schema", () => {
  const mk = (name: string) => ({
    __name: name,
    id: { __col: `${name}.id` },
    photoKey: {},
    photoUrl: {},
    logoUrl: {},
    organizationId: {},
    deletedAt: {},
  });
  return {
    attendanceEntries: mk("attendance_entries"),
    activityPhotos: mk("activity_photos"),
    organizations: mk("organizations"),
    users: mk("users"),
    eventRooms: mk("event_rooms"),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: () => ({ __op: "eq" }),
  and: (...c: unknown[]) => ({ __op: "and", c }),
  isNull: () => ({ __op: "isNull" }),
}));

vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: (t: { __name: string }) => ({
        where: () => ({
          limit: () => Promise.resolve(hoisted.rows[t.__name] ? [hoisted.rows[t.__name]] : []),
        }),
      }),
    }),
  },
}));

vi.mock("../storage.service", () => ({
  createPresignedGet: async (key: string, ttl: number) => {
    hoisted.signed.push({ key, ttl });
    return `https://signed.example/${key}?exp=${ttl}`;
  },
}));

import { resolveMediaUrl, isMediaResource } from "../media.service";
import { MEDIA_URL_TTL_SECONDS } from "../../config/constants";

const ORG = "11111111-1111-1111-1111-111111111111";

describe("media resolution", () => {
  beforeEach(() => {
    hoisted.rows = {};
    hoisted.signed = [];
  });

  it("accepts only the known resource kinds", () => {
    expect(isMediaResource("attendance")).toBe(true);
    expect(isMediaResource("activity-photo")).toBe(true);
    expect(isMediaResource("../../etc/passwd")).toBe(false);
    expect(isMediaResource("recordings")).toBe(false);
  });

  it("signs the stored key for an attendance photo", async () => {
    hoisted.rows.attendance_entries = { key: "attendance/room-1/abc.jpg" };

    const url = await resolveMediaUrl("attendance", "entry-1", ORG);

    expect(hoisted.signed).toEqual([
      { key: "attendance/room-1/abc.jpg", ttl: MEDIA_URL_TTL_SECONDS },
    ]);
    expect(url).toContain("attendance/room-1/abc.jpg");
  });

  it("recovers the key from a stored public URL for branding images", async () => {
    // organizations.logo_url and users.photo_url predate the key/url split and
    // hold a full URL, so the key is the path buildPublicUrl prepended to.
    hoisted.rows.organizations = {
      url: "https://pub-abc.r2.dev/branding/organizations/org-1/logo.png",
    };

    await resolveMediaUrl("org-logo", ORG, ORG);

    expect(hoisted.signed[0]!.key).toBe("branding/organizations/org-1/logo.png");
  });

  it("decodes percent-escapes when recovering a key", async () => {
    hoisted.rows.users = { url: "https://pub-abc.r2.dev/branding/users/u1/a%20b.png" };

    await resolveMediaUrl("user-avatar", "user-1", ORG);

    expect(hoisted.signed[0]!.key).toBe("branding/users/u1/a b.png");
  });

  it("treats a bare key stored in the url column as a key", async () => {
    hoisted.rows.users = { url: "branding/users/u1/plain.png" };

    await resolveMediaUrl("user-avatar", "user-1", ORG);

    expect(hoisted.signed[0]!.key).toBe("branding/users/u1/plain.png");
  });

  it("refuses another organisation's logo", async () => {
    await expect(
      resolveMediaUrl("org-logo", "22222222-2222-2222-2222-222222222222", ORG),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(hoisted.signed).toHaveLength(0);
  });

  it("reports a missing row and an image-less row identically", async () => {
    // The endpoint must not reveal which of the two it was.
    await expect(resolveMediaUrl("attendance", "missing", ORG)).rejects.toMatchObject({
      statusCode: 404,
    });

    hoisted.rows.attendance_entries = { key: null };
    await expect(resolveMediaUrl("attendance", "no-photo", ORG)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(hoisted.signed).toHaveLength(0);
  });

  it("signs nothing when access is refused", async () => {
    // A signature handed out before the check would be a usable capability
    // regardless of the error the caller sees.
    await expect(resolveMediaUrl("org-logo", "33333333-3333-3333-3333-333333333333", ORG))
      .rejects.toThrow();
    expect(hoisted.signed).toHaveLength(0);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError } from "../../utils/errors";

// Set up mutable mock results so each test can customize them
let mockSelectRoomResult: any[] = [];
let mockSelectFormResult: any[] = [];
let mockInsertResult: any[] = [];

// Mock env
vi.mock("../../config/env", () => ({
  env: {
    ATTENDANCE_WINDOW_BEFORE_MINUTES: 15,
    ATTENDANCE_WINDOW_AFTER_MINUTES: 30,
  },
}));

// Mock the event-assignment policy
vi.mock("../event-assignment.service", () => ({
  assertRoomAccessForUser: vi.fn().mockResolvedValue(undefined),
  assertRoomAccessWithRoom: vi.fn().mockResolvedValue(undefined),
}));

// Mock storage service
vi.mock("../storage.service", () => ({
  buildPublicUrl: vi.fn((key: string) => `https://s3.example.com/${key}`),
  verifyStorageObject: vi.fn().mockResolvedValue({ contentLength: 1024, contentType: "image/jpeg" }),
}));

// Mock db
vi.mock("../../db", () => {
  let lastTable: any = null;

  const mockDbChain = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table) => {
        lastTable = table;
        return {
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(async () => {
            if (lastTable && typeof lastTable === "object" && "scheduledStart" in lastTable) {
              return mockSelectRoomResult;
            }
            if (lastTable && typeof lastTable === "object" && "fields" in lastTable) {
              return mockSelectFormResult;
            }
            return [];
          }),
        };
      }),
    })),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(async () => mockInsertResult),
  };

  return {
    db: mockDbChain,
  };
});

// Import service after mocking
import { submitAttendance } from "../attendance.service";
import { verifyStorageObject } from "../storage.service";

describe("submitAttendance - Time-Window Integration", () => {
  const roomId = "room-123";
  const orgId = "org-456";
  const userId = "user-789";
  const formDefinitionId = "form-123";

  const standardCtx = {
    roomId,
    orgId,
    submittedBy: userId,
    user: { id: userId, role: "volunteer" as const },
    input: {
      formDefinitionId,
      data: { name: "John Doe" },
      photoKey: undefined,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default form setup
    mockSelectFormResult = [
      {
        id: formDefinitionId,
        roomId,
        fields: [{ id: "name", label: "Name", type: "text", required: true }],
      },
    ];

    // Default insert setup
    mockInsertResult = [
      {
        id: "entry-123",
        roomId,
        formDefinitionId,
        submittedBy: userId,
        data: { name: "John Doe" },
        photoKey: null,
        photoUrl: null,
        submittedAt: new Date(),
      },
    ];
  });

  it("throws badRequest error if the submission is made before the allowed scheduled window", async () => {
    const scheduledStart = new Date("2026-05-17T10:00:00Z");
    const scheduledEnd = new Date("2026-05-17T12:00:00Z");

    mockSelectRoomResult = [
      {
        id: roomId,
        status: "scheduled",
        scheduledStart,
        scheduledEnd,
        actualStart: null,
        actualEnd: null,
      },
    ];

    // mock current time to be 20 minutes before scheduled start (buffer is 15 minutes)
    const now = new Date(scheduledStart.getTime() - 20 * 60 * 1000);
    vi.setSystemTime(now);

    await expect(submitAttendance(standardCtx)).rejects.toThrowError(
      ApiError.badRequest("Attendance can only be submitted during the active window")
    );

    vi.useRealTimers();
  });

  it("throws badRequest error if the submission is made after scheduledEnd when room never went live", async () => {
    const scheduledStart = new Date("2026-05-17T10:00:00Z");
    const scheduledEnd = new Date("2026-05-17T12:00:00Z");

    mockSelectRoomResult = [
      {
        id: roomId,
        status: "scheduled",
        scheduledStart,
        scheduledEnd,
        actualStart: null,
        actualEnd: null,
      },
    ];

    // mock current time to be 1 minute after scheduledEnd
    const now = new Date(scheduledEnd.getTime() + 1 * 60 * 1000);
    vi.setSystemTime(now);

    await expect(submitAttendance(standardCtx)).rejects.toThrowError(
      ApiError.badRequest("Attendance can only be submitted during the active window")
    );

    vi.useRealTimers();
  });

  it("successfully records attendance if the submission is within the scheduled room's buffer window", async () => {
    const scheduledStart = new Date("2026-05-17T10:00:00Z");
    const scheduledEnd = new Date("2026-05-17T12:00:00Z");

    mockSelectRoomResult = [
      {
        id: roomId,
        status: "scheduled",
        scheduledStart,
        scheduledEnd,
        actualStart: null,
        actualEnd: null,
      },
    ];

    // mock current time to be 10 minutes before scheduled start (within the 15-minute buffer)
    const now = new Date(scheduledStart.getTime() - 10 * 60 * 1000);
    vi.setSystemTime(now);

    const result = await submitAttendance(standardCtx);
    expect(result).toBeDefined();
    expect(result.id).toBe("entry-123");

    vi.useRealTimers();
  });

  it("successfully records attendance if the room is live and has no actualEnd", async () => {
    mockSelectRoomResult = [
      {
        id: roomId,
        status: "live",
        scheduledStart: new Date(),
        scheduledEnd: new Date(),
        actualStart: new Date(),
        actualEnd: null,
      },
    ];

    const result = await submitAttendance(standardCtx);
    expect(result).toBeDefined();
    expect(result.id).toBe("entry-123");
  });

  it("throws badRequest error if the room is live but has actualEnd and now is past afterMinutes limit", async () => {
    const actualEnd = new Date("2026-05-17T11:00:00Z");
    mockSelectRoomResult = [
      {
        id: roomId,
        status: "live",
        scheduledStart: new Date(),
        scheduledEnd: new Date(),
        actualStart: new Date(),
        actualEnd,
      },
    ];

    // 35 minutes after actualEnd (buffer is 30 minutes)
    const now = new Date(actualEnd.getTime() + 35 * 60 * 1000);
    vi.setSystemTime(now);

    await expect(submitAttendance(standardCtx)).rejects.toThrowError(
      ApiError.badRequest("Attendance can only be submitted during the active window")
    );

    vi.useRealTimers();
  });

  it("throws badRequest error if the room has ended and now is past afterMinutes limit", async () => {
    const actualEnd = new Date("2026-05-17T11:00:00Z");
    mockSelectRoomResult = [
      {
        id: roomId,
        status: "ended",
        scheduledStart: new Date(),
        scheduledEnd: new Date(),
        actualStart: new Date(),
        actualEnd,
      },
    ];

    // 31 minutes after actualEnd
    const now = new Date(actualEnd.getTime() + 31 * 60 * 1000);
    vi.setSystemTime(now);

    await expect(submitAttendance(standardCtx)).rejects.toThrowError(
      ApiError.badRequest("Attendance can only be submitted during the active window")
    );

    vi.useRealTimers();
  });

  it("successfully records attendance if the room has ended but now is within afterMinutes limit", async () => {
    const actualEnd = new Date("2026-05-17T11:00:00Z");
    mockSelectRoomResult = [
      {
        id: roomId,
        status: "ended",
        scheduledStart: new Date(),
        scheduledEnd: new Date(),
        actualStart: new Date(),
        actualEnd,
      },
    ];

    // 25 minutes after actualEnd
    const now = new Date(actualEnd.getTime() + 25 * 60 * 1000);
    vi.setSystemTime(now);

    const result = await submitAttendance(standardCtx);
    expect(result).toBeDefined();
    expect(result.id).toBe("entry-123");

    vi.useRealTimers();
  });

  it("uses room-level custom attendance windows instead of defaults", async () => {
    const scheduledStart = new Date("2026-05-17T10:00:00Z");
    const scheduledEnd = new Date("2026-05-17T12:00:00Z");

    mockSelectRoomResult = [
      {
        id: roomId,
        status: "scheduled",
        scheduledStart,
        scheduledEnd,
        actualStart: null,
        actualEnd: null,
        attendanceWindowBefore: 60,
        attendanceWindowAfter: 90,
      },
    ];

    // Mock current time to be 45 minutes before scheduled start (within custom 60m window, but past standard 15m default)
    const now = new Date(scheduledStart.getTime() - 45 * 60 * 1000);
    vi.setSystemTime(now);

    const result = await submitAttendance(standardCtx);
    expect(result).toBeDefined();
    expect(result.id).toBe("entry-123");

    vi.useRealTimers();
  });

  it("verifies photo proof in storage when photoKey is provided (DEF-004)", async () => {
    mockSelectRoomResult = [
      {
        id: roomId,
        status: "live",
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
        actualStart: new Date(),
        actualEnd: null,
      },
    ];

    const ctxWithPhoto = {
      ...standardCtx,
      input: {
        ...standardCtx.input,
        photoKey: "attendance/room-123/proof-1.jpg",
      },
    };

    const result = await submitAttendance(ctxWithPhoto);
    expect(result).toBeDefined();
    expect(verifyStorageObject).toHaveBeenCalledWith("attendance/room-123/proof-1.jpg", {
      expectedPrefix: "attendance/room-123/",
    });
  });

  it("rejects submission when photoKey storage verification fails (DEF-004)", async () => {
    mockSelectRoomResult = [
      {
        id: roomId,
        status: "live",
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
        actualStart: new Date(),
        actualEnd: null,
      },
    ];

    vi.mocked(verifyStorageObject).mockRejectedValueOnce(
      ApiError.badRequest("Photo proof does not exist in storage. Please upload the photo first."),
    );

    const ctxWithPhoto = {
      ...standardCtx,
      input: {
        ...standardCtx.input,
        photoKey: "attendance/room-123/non-existent.jpg",
      },
    };

    await expect(submitAttendance(ctxWithPhoto)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Photo proof does not exist in storage"),
    });
  });
});

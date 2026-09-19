import { describe, it, expect, vi, beforeEach } from "vitest";
import { validate } from "../middleware/validate";
import {
  VerifyEmailSchema,
  ResendVerificationSchema,
  PdfJobStatusParamsSchema,
} from "@application/shared";
import { createFeedback } from "../controllers/feedback.controller";
import { createBugReport } from "../controllers/bug-report.controller";
import { getPdfJobStatus } from "../controllers/report-status.controller";
import { updateRoom } from "../controllers/room/room-crud.controller";
import { feedback, bugReports } from "../db/schema";
import { db } from "../db";

vi.mock("../db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return {
    db: mockDb,
    authDb: mockDb,
    pool: { query: vi.fn() },
  };
});

vi.mock("../services/audit.service", () => ({
  recordAuditSafely: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/event-assignment.service", () => ({
  assertRoomAccessWithRoom: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/activity.service", () => ({
  validateActivityQuotas: vi.fn().mockResolvedValue(undefined),
}));

describe("Validation and Schema Defect Fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DEF-013: Email verification validation schemas", () => {
    it("VerifyEmailSchema accepts valid token and rejects empty", async () => {
      const validReq: any = { body: { token: "valid-tok-123" } };
      const nextValid = vi.fn();
      validate(VerifyEmailSchema)(validReq, {} as any, nextValid);
      expect(nextValid).toHaveBeenCalledWith();

      const invalidReq: any = { body: { token: "" } };
      const nextInvalid = vi.fn();
      validate(VerifyEmailSchema)(invalidReq, {} as any, nextInvalid);
      expect(nextInvalid).toHaveBeenCalledWith(expect.objectContaining({ name: "ZodError" }));
    });

    it("ResendVerificationSchema accepts valid email, normalizes, and rejects invalid", async () => {
      const validReq: any = { body: { email: "User@Domain.COM" } };
      const nextValid = vi.fn();
      validate(ResendVerificationSchema)(validReq, {} as any, nextValid);
      expect(nextValid).toHaveBeenCalledWith();
      expect(validReq.body.email).toBe("user@domain.com");

      const invalidReq: any = { body: { email: "bad-email" } };
      const nextInvalid = vi.fn();
      validate(ResendVerificationSchema)(invalidReq, {} as any, nextInvalid);
      expect(nextInvalid).toHaveBeenCalledWith(expect.objectContaining({ name: "ZodError" }));
    });
  });

  describe("DEF-015: Mass assignment prevention in feedback and bug-report controllers", () => {
    it("createFeedback only persists explicit fields and discards injected payload properties", async () => {
      const req: any = {
        user: { id: "11111111-1111-4111-a111-111111111111", organizationId: "22222222-2222-4222-a222-222222222222" },
        body: {
          category: "Performance",
          rating: 4,
          subject: "Fast loading",
          comments: "App is snappy",
          injectedRole: "superadmin",
          injectedTenant: "attacker-org",
          createdAt: new Date("2000-01-01"),
        },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const returningMock = vi.fn().mockResolvedValue([{ id: "fb-1" }]);
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: returningMock }),
      });

      await createFeedback(req, res, next);

      expect(db.insert).toHaveBeenCalledWith(feedback);
      const valuesCall = (db.insert(feedback).values as any).mock.calls[0][0];
      expect(valuesCall).toEqual({
        userId: "11111111-1111-4111-a111-111111111111",
        organizationId: "22222222-2222-4222-a222-222222222222",
        category: "Performance",
        rating: 4,
        subject: "Fast loading",
        comments: "App is snappy",
      });
      expect(valuesCall).not.toHaveProperty("injectedRole");
      expect(valuesCall).not.toHaveProperty("injectedTenant");
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("createBugReport only persists explicit fields and discards injected payload properties", async () => {
      const req: any = {
        user: { id: "11111111-1111-4111-a111-111111111111", organizationId: "22222222-2222-4222-a222-222222222222" },
        body: {
          severity: "high",
          component: "camera",
          title: "Black screen",
          steps: "Open camera",
          expected: "Viewfinder shows feed",
          actual: "Black screen",
          systemInfo: '{"browser":"Chrome"}',
          injectedStatus: "resolved",
          injectedAdminFlag: true,
        },
      };
      const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const returningMock = vi.fn().mockResolvedValue([{ id: "bug-1" }]);
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: returningMock }),
      });

      await createBugReport(req, res, next);

      expect(db.insert).toHaveBeenCalledWith(bugReports);
      const valuesCall = (db.insert(bugReports).values as any).mock.calls[0][0];
      expect(valuesCall).toEqual({
        userId: "11111111-1111-4111-a111-111111111111",
        organizationId: "22222222-2222-4222-a222-222222222222",
        severity: "high",
        component: "camera",
        title: "Black screen",
        steps: "Open camera",
        expected: "Viewfinder shows feed",
        actual: "Black screen",
        systemInfo: '{"browser":"Chrome"}',
      });
      expect(valuesCall).not.toHaveProperty("injectedStatus");
      expect(valuesCall).not.toHaveProperty("injectedAdminFlag");
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe("DEF-007: UpdateRoom date schedule enforcement against DB", () => {
    it("rejects when only scheduledEnd is updated to be before existing scheduledStart in DB", async () => {
      const existingRoom = {
        title: "Relief Event",
        status: "scheduled",
        scheduledStart: new Date("2026-07-17T10:00:00Z"),
        scheduledEnd: new Date("2026-07-17T14:00:00Z"),
        cancellationReason: null,
      };

      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingRoom]),
          }),
        }),
      });

      const req: any = {
        user: { id: "u-1", email: "admin@example.com", role: "admin", organizationId: "org-1" },
        params: { id: "room-1" },
        body: {
          scheduledEnd: "2026-07-17T09:00:00Z", // before existing start (10:00:00Z)
        },
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await updateRoom(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0]![0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain("Scheduled end must be after scheduled start");
    });

    it("rejects when only scheduledStart is updated to be after existing scheduledEnd in DB", async () => {
      const existingRoom = {
        title: "Relief Event",
        status: "scheduled",
        scheduledStart: new Date("2026-07-17T10:00:00Z"),
        scheduledEnd: new Date("2026-07-17T14:00:00Z"),
        cancellationReason: null,
      };

      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingRoom]),
          }),
        }),
      });

      const req: any = {
        user: { id: "u-1", email: "admin@example.com", role: "admin", organizationId: "org-1" },
        params: { id: "room-1" },
        body: {
          scheduledStart: "2026-07-17T15:00:00Z", // after existing end (14:00:00Z)
        },
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await updateRoom(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0]![0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain("Scheduled end must be after scheduled start");
    });

    it("allows updating non-date fields without date rejection", async () => {
      const existingRoom = {
        id: "room-1",
        organizationId: "org-1",
        createdBy: "u-1",
        title: "Old Title",
        description: null,
        status: "scheduled",
        scheduledStart: new Date("2026-07-17T10:00:00Z"),
        scheduledEnd: new Date("2026-07-17T14:00:00Z"),
        actualStart: null,
        actualEnd: null,
        maxParticipants: null,
        shareToken: "tok",
        streamProvider: "livekit",
        youtubeWatchUrl: null,
        youtubeEmbedUrl: null,
        attendanceWindowBefore: 15,
        attendanceWindowAfter: 30,
        notifyEmailOnStart: false,
        location: null,
        latitude: null,
        longitude: null,
        activityDefinitions: [],
        cancellationReason: null,
        createdAt: new Date("2026-07-17T09:00:00Z"),
        updatedAt: new Date("2026-07-17T09:00:00Z"),
      };

      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingRoom]),
          }),
        }),
      });

      const updatedRow = { ...existingRoom, title: "New Title", updatedAt: new Date() };
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedRow]),
          }),
        }),
      });

      const req: any = {
        user: { id: "u-1", email: "admin@example.com", role: "admin", organizationId: "org-1" },
        params: { id: "room-1" },
        body: {
          title: "New Title",
        },
        get: vi.fn().mockReturnValue(undefined),
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await updateRoom(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("DEF-024: PDF job status UUID validation and room scoping", () => {
    it("validates valid UUID or pdf_<uuid> and scopes query by both jobId and roomId", async () => {
      const validRoomId = "123e4567-e89b-12d3-a456-426614174000";
      const validJobId = "pdf_987fcdeb-51a2-43d7-9876-543210987654";

      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                jobId: validJobId,
                status: "completed",
                s3Url: "https://bucket/report.pdf",
                errorMessage: null,
                attempts: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                completedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const req: any = {
        user: { id: "u-1", organizationId: "11111111-2222-3333-4444-555555555555" },
        params: { id: validRoomId, jobId: validJobId },
      };
      const res: any = { json: vi.fn() };
      const next = vi.fn();

      await getPdfJobStatus(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: validJobId,
          status: "completed",
        }),
      );
    });

    it("rejects non-UUID arbitrary string via PdfJobStatusParamsSchema", async () => {
      const invalidReq: any = {
        params: { id: "123e4567-e89b-12d3-a456-426614174000", jobId: "malicious'; DROP TABLE pdf_jobs;--" },
      };
      const next = vi.fn();

      validate(PdfJobStatusParamsSchema, "params")(invalidReq, {} as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: "ZodError" }));
    });
  });
});

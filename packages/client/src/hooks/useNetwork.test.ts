import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNetwork } from "./useNetwork";
import { api, attendanceApi, activitiesApi, uploadToPresignedUrl } from "../lib/api";
import { db } from "../lib/db";

vi.mock("../lib/api", () => ({
  api: {
    post: vi.fn(),
  },
  attendanceApi: {
    presignPhoto: vi.fn(),
  },
  activitiesApi: {
    presignPhoto: vi.fn(),
  },
  uploadToPresignedUrl: vi.fn(),
}));

const mockAttendanceStore: any[] = [];
const mockActivitiesStore: any[] = [];

vi.mock("../lib/db", () => ({
  db: {
    attendance: {
      filter: vi.fn((predicate: (item: any) => boolean) => ({
        toArray: vi.fn(async () => mockAttendanceStore.filter(predicate)),
      })),
      update: vi.fn(async (id: number, changes: any) => {
        const item = mockAttendanceStore.find((x) => x.id === id);
        if (item) Object.assign(item, changes);
      }),
      delete: vi.fn(async (id: number) => {
        const idx = mockAttendanceStore.findIndex((x) => x.id === id);
        if (idx !== -1) mockAttendanceStore.splice(idx, 1);
      }),
    },
    activities: {
      filter: vi.fn((predicate: (item: any) => boolean) => ({
        toArray: vi.fn(async () => mockActivitiesStore.filter(predicate)),
      })),
      update: vi.fn(async (id: number, changes: any) => {
        const item = mockActivitiesStore.find((x) => x.id === id);
        if (item) Object.assign(item, changes);
      }),
      delete: vi.fn(async (id: number) => {
        const idx = mockActivitiesStore.findIndex((x) => x.id === id);
        if (idx !== -1) mockActivitiesStore.splice(idx, 1);
      }),
    },
  },
}));

describe("useNetwork offline sync engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAttendanceStore.length = 0;
    mockActivitiesStore.length = 0;
  });

  it("finds unsynced attendance records using filter and syncs with idempotencyKey", async () => {
    const postMock = vi.mocked(api.post).mockResolvedValue({ id: "entry-1" });

    // Insert an offline attendance entry with synced: false (boolean)
    mockAttendanceStore.push({
      id: 101,
      roomId: "room-123",
      formDefinitionId: "form-456",
      data: { name: "Alice" },
      synced: false,
      createdAt: 1700000000000,
    });

    const { result } = renderHook(() => useNetwork());

    // Trigger sync
    await act(async () => {
      await result.current.syncOfflineData();
    });

    // Check filter was called and returned the unsynced record
    expect(db.attendance.filter).toHaveBeenCalled();

    // Check API was called with proper payload and idempotency key
    expect(postMock).toHaveBeenCalledWith("/rooms/room-123/attendance", {
      formDefinitionId: "form-456",
      data: { name: "Alice" },
      photoKey: undefined,
      latitude: undefined,
      longitude: undefined,
      idempotencyKey: "att_101_1700000000000",
    });

    // Verify record was deleted upon successful sync
    expect(db.attendance.delete).toHaveBeenCalledWith(101);
    expect(mockAttendanceStore).toHaveLength(0);
  });

  it("finds unsynced activity records using filter and syncs with idempotencyKey", async () => {
    const postMock = vi.mocked(api.post).mockResolvedValue({ id: "sub-1" });

    mockActivitiesStore.push({
      id: 202,
      roomId: "room-123",
      activityId: "act-456",
      photoKey: "photos/proof.jpg",
      synced: false,
      createdAt: 1700000001000,
    });

    const { result } = renderHook(() => useNetwork());

    await act(async () => {
      await result.current.syncOfflineData();
    });

    expect(db.activities.filter).toHaveBeenCalled();

    expect(postMock).toHaveBeenCalledWith("/rooms/room-123/activities/submission", {
      activityId: "act-456",
      photoKey: "photos/proof.jpg",
      latitude: undefined,
      longitude: undefined,
      idempotencyKey: "act_202_1700000001000",
    });

    expect(db.activities.delete).toHaveBeenCalledWith(202);
    expect(mockActivitiesStore).toHaveLength(0);
  });

  it("presigns, uploads, and syncs offline attendance record with photoBlob", async () => {
    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const presignMock = vi.mocked(attendanceApi.presignPhoto).mockResolvedValue({
      uploadUrl: "https://s3.amazonaws.com/upload-ticket-1",
      key: "photos/attendance-s3-key.jpg",
      publicUrl: "https://cdn.example.com/photos/attendance-s3-key.jpg",
      expiresIn: 900,
    });
    const uploadMock = vi.mocked(uploadToPresignedUrl).mockResolvedValue(undefined);
    const postMock = vi.mocked(api.post).mockResolvedValue({ id: "entry-photo-1" });

    mockAttendanceStore.push({
      id: 303,
      roomId: "room-photo-1",
      formDefinitionId: "form-photo-1",
      data: { attendee: "Bob" },
      photoBlob: fakeBlob,
      synced: false,
      createdAt: 1700000002000,
    });

    const { result } = renderHook(() => useNetwork());

    await act(async () => {
      await result.current.syncOfflineData();
    });

    expect(presignMock).toHaveBeenCalledWith("room-photo-1", {
      contentType: "image/jpeg",
      sizeBytes: fakeBlob.size,
    });
    expect(uploadMock).toHaveBeenCalledWith("https://s3.amazonaws.com/upload-ticket-1", fakeBlob);
    expect(db.attendance.update).toHaveBeenCalledWith(303, {
      photoKey: "photos/attendance-s3-key.jpg",
      photoBlob: undefined,
    });
    expect(postMock).toHaveBeenCalledWith("/rooms/room-photo-1/attendance", {
      formDefinitionId: "form-photo-1",
      data: { attendee: "Bob" },
      photoKey: "photos/attendance-s3-key.jpg",
      latitude: undefined,
      longitude: undefined,
      idempotencyKey: "att_303_1700000002000",
    });
    expect(db.attendance.delete).toHaveBeenCalledWith(303);
    expect(mockAttendanceStore).toHaveLength(0);
  });

  it("presigns, uploads, and syncs offline activity record with photoBlob", async () => {
    const fakeBlob = new Blob(["activity-image-data"], { type: "image/jpeg" });
    const presignMock = vi.mocked(activitiesApi.presignPhoto).mockResolvedValue({
      uploadUrl: "https://s3.amazonaws.com/upload-activity-ticket",
      key: "photos/activity-s3-key.jpg",
      publicUrl: "https://cdn.example.com/photos/activity-s3-key.jpg",
      expiresIn: 900,
    });
    const uploadMock = vi.mocked(uploadToPresignedUrl).mockResolvedValue(undefined);
    const postMock = vi.mocked(api.post).mockResolvedValue({ id: "sub-photo-1" });

    mockActivitiesStore.push({
      id: 404,
      roomId: "room-act-1",
      activityId: "act-act-1",
      photoBlob: fakeBlob,
      synced: false,
      createdAt: 1700000003000,
    });

    const { result } = renderHook(() => useNetwork());

    await act(async () => {
      await result.current.syncOfflineData();
    });

    expect(presignMock).toHaveBeenCalledWith("room-act-1", {
      activityId: "act-act-1",
      contentType: "image/jpeg",
      sizeBytes: fakeBlob.size,
    });
    expect(uploadMock).toHaveBeenCalledWith("https://s3.amazonaws.com/upload-activity-ticket", fakeBlob);
    expect(db.activities.update).toHaveBeenCalledWith(404, {
      photoKey: "photos/activity-s3-key.jpg",
      photoBlob: undefined,
    });
    expect(postMock).toHaveBeenCalledWith("/rooms/room-act-1/activities/submission", {
      activityId: "act-act-1",
      photoKey: "photos/activity-s3-key.jpg",
      latitude: undefined,
      longitude: undefined,
      idempotencyKey: "act_404_1700000003000",
    });
    expect(db.activities.delete).toHaveBeenCalledWith(404);
    expect(mockActivitiesStore).toHaveLength(0);
  });

  it("uses pre-existing record.idempotencyKey when available on offline attendance", async () => {
    const postMock = vi.mocked(api.post).mockResolvedValue({ id: "entry-pre-idemp" });

    mockAttendanceStore.push({
      id: 505,
      roomId: "room-505",
      formDefinitionId: "form-505",
      data: { name: "Bob" },
      idempotencyKey: "att_room-505_1700000004000_custom-uuid-key",
      synced: false,
      createdAt: 1700000004000,
    });

    const { result } = renderHook(() => useNetwork());

    await act(async () => {
      await result.current.syncOfflineData();
    });

    expect(postMock).toHaveBeenCalledWith("/rooms/room-505/attendance", {
      formDefinitionId: "form-505",
      data: { name: "Bob" },
      photoKey: undefined,
      latitude: undefined,
      longitude: undefined,
      idempotencyKey: "att_room-505_1700000004000_custom-uuid-key",
    });
    expect(db.attendance.delete).toHaveBeenCalledWith(505);
  });
});

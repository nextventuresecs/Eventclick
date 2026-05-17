import { Router } from "express";
import {
  CreateRoomSchema,
  FormDefinitionSchema,
  PhotoUploadRequestSchema,
  SetYouTubeFallbackSchema,
  SubmitAttendanceSchema,
  UpdateRoomSchema,
  hasRolePermission,
} from "@application/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { validate } from "../middleware/validate";
import { ApiError } from "../utils/errors";
import {
  listRooms,
  createRoom,
  getRoom,
  updateRoom,
  deleteRoom,
  setYouTubeFallback,
  clearFallback,
  getLiveToken,
  startLive,
  stopLive,
  getPresence,
} from "../controllers/room.controller";
import { getRoomForm, saveRoomForm } from "../controllers/form.controller";
import {
  listRoomAttendance,
  postAttendance,
  presignAttendancePhoto,
} from "../controllers/attendance.controller";

export const roomRouter = Router();

roomRouter.use(requireAuth);

const canManageRooms = requirePermission("manage_rooms");
const canManageLiveSession = requirePermission("manage_live_session");
const canCreateAttendanceForm = requirePermission("create_attendance_form");
const canTakeAttendance = requirePermission("take_attendance");
const canViewReports = requirePermission("view_reports");
const canViewLiveSession = requirePermission("view_live_session");

const canViewAttendance = (req: any, res: any, next: any) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (
    hasRolePermission(req.user.role, "view_reports") ||
    hasRolePermission(req.user.role, "take_attendance")
  ) {
    return next();
  }
  return next(ApiError.forbidden("Insufficient permissions"));
};

roomRouter.get("/", listRooms);
roomRouter.post("/", canManageRooms, validate(CreateRoomSchema), createRoom);
roomRouter.get("/:id", getRoom);
roomRouter.patch("/:id", canManageRooms, validate(UpdateRoomSchema), updateRoom);
roomRouter.delete("/:id", canManageRooms, deleteRoom);

roomRouter.post(
  "/:id/fallback/youtube",
  canManageLiveSession,
  validate(SetYouTubeFallbackSchema),
  setYouTubeFallback,
);
roomRouter.post("/:id/fallback/clear", canManageLiveSession, clearFallback);

roomRouter.post("/:id/live-token", canViewLiveSession, getLiveToken);
roomRouter.post("/:id/start", canManageLiveSession, startLive);
roomRouter.post("/:id/stop", canManageLiveSession, stopLive);
roomRouter.get("/:id/presence", getPresence);

roomRouter.get("/:id/form", getRoomForm);
roomRouter.put(
  "/:id/form",
  canCreateAttendanceForm,
  validate(FormDefinitionSchema),
  saveRoomForm,
);

roomRouter.post(
  "/:id/attendance/photo-upload",
  canTakeAttendance,
  validate(PhotoUploadRequestSchema),
  presignAttendancePhoto,
);
roomRouter.post(
  "/:id/attendance",
  canTakeAttendance,
  validate(SubmitAttendanceSchema),
  postAttendance,
);
roomRouter.get("/:id/attendance", canViewAttendance, listRoomAttendance);

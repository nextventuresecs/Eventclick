import { Router } from "express";
import {
  CreateRoomSchema,
  FormDefinitionSchema,
  PhotoUploadRequestSchema,
  SetYouTubeFallbackSchema,
  SubmitAttendanceSchema,
  UpdateRoomSchema,
} from "@application/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
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

const canManageRooms = requireRole("super_admin", "event_admin", "organizer");
const canManageFallback = requireRole("super_admin", "event_admin");

roomRouter.get("/", listRooms);
roomRouter.post("/", canManageRooms, validate(CreateRoomSchema), createRoom);
roomRouter.get("/:id", getRoom);
roomRouter.patch("/:id", canManageRooms, validate(UpdateRoomSchema), updateRoom);
roomRouter.delete("/:id", canManageRooms, deleteRoom);

roomRouter.post(
  "/:id/fallback/youtube",
  canManageFallback,
  validate(SetYouTubeFallbackSchema),
  setYouTubeFallback,
);
roomRouter.post("/:id/fallback/clear", canManageFallback, clearFallback);

roomRouter.post("/:id/live-token", getLiveToken);
roomRouter.post("/:id/start", canManageRooms, startLive);
roomRouter.post("/:id/stop", canManageRooms, stopLive);
roomRouter.get("/:id/presence", getPresence);

roomRouter.get("/:id/form", getRoomForm);
roomRouter.put(
  "/:id/form",
  canManageFallback,
  validate(FormDefinitionSchema),
  saveRoomForm,
);

roomRouter.post(
  "/:id/attendance/photo-upload",
  validate(PhotoUploadRequestSchema),
  presignAttendancePhoto,
);
roomRouter.post(
  "/:id/attendance",
  validate(SubmitAttendanceSchema),
  postAttendance,
);
roomRouter.get("/:id/attendance", canManageFallback, listRoomAttendance);

import { Router } from "express";
import { CreateRoomSchema, UpdateRoomSchema } from "@application/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import {
  listRooms,
  createRoom,
  getRoom,
  updateRoom,
  deleteRoom,
} from "../controllers/room.controller";

export const roomRouter = Router();

roomRouter.use(requireAuth);

const canManageRooms = requireRole("super_admin", "event_admin", "organizer");

roomRouter.get("/", listRooms);
roomRouter.post("/", canManageRooms, validate(CreateRoomSchema), createRoom);
roomRouter.get("/:id", getRoom);
roomRouter.patch("/:id", canManageRooms, validate(UpdateRoomSchema), updateRoom);
roomRouter.delete("/:id", canManageRooms, deleteRoom);

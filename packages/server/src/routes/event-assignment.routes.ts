import { Router } from "express";
import { AssignEventAdminSchema, UpdateEventAdminAssignmentSchema } from "@application/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { validate } from "../middleware/validate";
import {
  createAssignment,
  listAssignments,
  listAssignmentUsers,
  revokeAssignment,
  updateAssignment,
} from "../controllers/event-assignment.controller";

export const eventAssignmentRouter = Router();

eventAssignmentRouter.use(requireAuth);
eventAssignmentRouter.use(requirePermission("manage_users"));

eventAssignmentRouter.get("/users", listAssignmentUsers);
eventAssignmentRouter.get("/", listAssignments);
eventAssignmentRouter.post("/", validate(AssignEventAdminSchema), createAssignment);
eventAssignmentRouter.patch("/:id", validate(UpdateEventAdminAssignmentSchema), updateAssignment);
eventAssignmentRouter.delete("/:id", revokeAssignment);

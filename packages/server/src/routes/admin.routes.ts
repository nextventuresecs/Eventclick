import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import {
  listOrgUsers,
  createOrgUser,
  listEventAssignments,
  assignUserToEvent,
  revokeEventAssignment,
} from "../controllers/admin.controller";
import { CreateUserSchema, AssignUserToEventSchema } from "../schemas/admin.schemas";

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole("ngo_admin"));

// User management
adminRouter.get("/users", listOrgUsers);
adminRouter.post("/users", validate(CreateUserSchema), createOrgUser);

// Event assignments
adminRouter.get("/events/:id/assignments", listEventAssignments);
adminRouter.post("/events/:id/assign", validate(AssignUserToEventSchema), assignUserToEvent);
adminRouter.delete("/events/:id/assignments/:assignmentId", revokeEventAssignment);

export default adminRouter;

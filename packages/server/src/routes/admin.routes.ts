import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import { listOrgUsers, createUser, deleteUser } from "../controllers/admin.controller";
import { CreateUserSchema, DeleteUserSchema } from "../schemas/admin.schemas";

export const adminRouter = Router();

adminRouter.use(requireAuth);

// User management
adminRouter.get("/users", requireRole("ngo_admin"), listOrgUsers);
adminRouter.post("/users", requireRole("ngo_admin"), validate(CreateUserSchema), createUser);
adminRouter.delete("/users/:id", requireAuth, validate(DeleteUserSchema), deleteUser);

export default adminRouter;

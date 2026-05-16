import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { validate } from "../middleware/validate";
import { listOrgUsers, createUser } from "../controllers/admin.controller";
import { CreateUserSchema } from "../schemas/admin.schemas";

export const adminRouter = Router();

// All admin routes require NGO Admin role
adminRouter.use(requireAuth);
adminRouter.use(requireRole("ngo_admin"));

// User management
adminRouter.get("/users", listOrgUsers);
adminRouter.post("/users", validate(CreateUserSchema), createUser);

export default adminRouter;

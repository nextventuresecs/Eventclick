import { Router } from "express";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  streamNotifications,
} from "../controllers/notification.controller";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// Protect all routes
router.use(requireAuth);

// SSE Stream must be declared before /:id so it doesn't get matched as a parameter
router.get("/stream", streamNotifications);

router.get("/", getNotifications);
router.post("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

export const notificationRoutes = router;

import { Router } from "express";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  streamNotifications,
  savePushSubscription,
  revokePushSubscription,
  sendTestPush,
} from "../controllers/notification.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { SavePushSubscriptionSchema, RevokePushSubscriptionSchema } from "@application/shared";

const router = Router();

// Protect all routes
router.use(requireAuth);

// SSE Stream must be declared before /:id so it doesn't get matched as a parameter
router.get("/stream", streamNotifications);

router.get("/", getNotifications);
router.post("/read-all", markAllNotificationsRead);
router.patch("/:id/read", markNotificationRead);

router.post("/push-subscription", validate(SavePushSubscriptionSchema), savePushSubscription);
router.delete("/push-subscription", validate(RevokePushSubscriptionSchema), revokePushSubscription);
router.post("/push-test", sendTestPush);

export const notificationRoutes = router;

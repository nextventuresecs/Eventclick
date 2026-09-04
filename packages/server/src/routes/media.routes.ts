import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import * as mediaController from "../controllers/media.controller";

export const mediaRouter = Router();

// GET /api/v1/media/:resource/:id → 302 to a short-lived signed URL.
//
// Authenticated on purpose. The uploads bucket is private and these objects
// include attendance and activity photos — identifiable people, alongside the
// latitude/longitude recorded with them. Serving them from a public bucket
// would make every one a permanent unauthenticated link; signing behind
// requireAuth keeps the tenant check on the request path, where it can be
// re-evaluated and revoked.
mediaRouter.get("/:resource/:id", requireAuth, mediaController.getMedia);

import { Router } from "express";
import {
  getSharedRoom,
  getShareLiveToken,
  getSharePresenceHandler,
} from "../controllers/share.controller";

export const shareRouter = Router();

shareRouter.get("/:token", getSharedRoom);
shareRouter.post("/:token/live-token", getShareLiveToken);
shareRouter.get("/:token/presence", getSharePresenceHandler);

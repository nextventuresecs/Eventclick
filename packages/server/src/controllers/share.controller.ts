import type { RequestHandler } from "express";
import { nanoid } from "nanoid";
import {
  getSharedRoomByToken,
  issueShareViewerToken,
} from "../services/share.service";
import { getSharePresence } from "../services/presence.service";

export const getSharedRoom: RequestHandler = async (req, res, next) => {
  try {
    const token = req.params.token as string;
    const room = await getSharedRoomByToken(token);
    res.json(room);
  } catch (err) {
    next(err);
  }
};

export const getShareLiveToken: RequestHandler = async (req, res, next) => {
  try {
    const token = req.params.token as string;
    const guestId = `guest-${nanoid(12)}`;
    const guestName =
      typeof req.body?.name === "string" && req.body.name.trim().length > 0
        ? String(req.body.name).trim().slice(0, 60)
        : "Guest";

    const live = await issueShareViewerToken(token, guestId, guestName);
    res.json(live);
  } catch (err) {
    next(err);
  }
};

export const getSharePresenceHandler: RequestHandler = async (req, res, next) => {
  try {
    const token = req.params.token as string;
    res.json(await getSharePresence(token));
  } catch (err) {
    next(err);
  }
};

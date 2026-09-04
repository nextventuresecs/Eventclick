import type { RequestHandler } from "express";
import type { SubmitContactRequestInput } from "@application/shared";
import { sendContactRequestEmail } from "../services/email.service";
import { logger } from "../utils/logger";

/**
 * Accepts a demo or support request from the marketing site.
 *
 * Responds 202 rather than 200: the submission is accepted for delivery, and
 * the caller is a public form that must not be told whether the notification
 * actually reached an inbox.
 */
export const submitContactRequest: RequestHandler = async (req, res, next) => {
  const request = req.body as SubmitContactRequestInput;
  try {
    await sendContactRequestEmail(request);
    res.status(202).json({ status: "accepted" });
  } catch (err) {
    logger.error(
      { err, kind: request.kind, event: "contact.request_failed" },
      "Contact request could not be delivered",
    );
    next(err);
  }
};

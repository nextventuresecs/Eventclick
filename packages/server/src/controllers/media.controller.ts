import type { RequestHandler } from "express";
import { z } from "zod";
import { MEDIA_URL_TTL_SECONDS } from "../config/constants";
import { isMediaResource, resolveMediaUrl } from "../services/media.service";
import { ApiError } from "../utils/errors";

const ParamsSchema = z.object({
  resource: z.string().refine(isMediaResource, "Unknown media resource"),
  id: z.string().uuid(),
});

/**
 * Redirects to a freshly signed URL for one stored image.
 *
 * The bucket is private, so a browser cannot fetch an object directly. Rather
 * than embedding an expiring URL in every payload — which would rot inside an
 * exported CSV and cost a signature per row whether or not the image is shown —
 * the API hands out a stable path and signs on demand, here, after checking the
 * caller may see it.
 *
 * **302, not a proxy.** Streaming the bytes through the API would put every
 * image on the Node event loop and through the application's egress. A redirect
 * lets the object store serve it directly while the access decision stays with
 * the application.
 *
 * **Two response shapes, because the browser has two ways of asking.** A 302 is
 * the right answer for direct navigation, but a client cannot attach an
 * `Authorization` header to `<img src>`, and reading the redirect with `fetch`
 * instead would require CORS on the bucket for a response JavaScript never
 * needs to inspect. So `Accept: application/json` returns the signed URL as
 * data — the caller authenticates the JSON request normally, then puts the URL
 * straight into an `<img>`, where no CORS applies because nothing reads the
 * bytes. Same access check, same short-lived signature, one extra round trip.
 *
 */
export const getMedia: RequestHandler = async (req, res, next) => {
  try {
    const parsed = ParamsSchema.safeParse(req.params);
    if (!parsed.success) throw ApiError.notFound("Media not found");

    const orgId = req.user?.organizationId;
    if (!orgId) throw ApiError.unauthorized();

    const url = await resolveMediaUrl(parsed.data.resource, parsed.data.id, orgId);

    // Never cached, by either shape: a shared cache holding this response would
    // hand a signed URL to a later, unauthorised request. The signed URL it
    // carries is separately short-lived.
    res.set("Cache-Control", "private, no-store");

    if (req.accepts(["html", "json"]) === "json") {
      res.json({ url, expiresIn: MEDIA_URL_TTL_SECONDS });
      return;
    }

    res.redirect(302, url);
  } catch (err) {
    next(err);
  }
};

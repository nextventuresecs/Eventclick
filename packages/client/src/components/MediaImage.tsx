import { useEffect, useState } from "react";
import type { MediaUrlResponse } from "@application/shared";
import { api } from "@/lib/api";

/**
 * Renders an image the API refers to by media path rather than by URL.
 *
 * Uploads live in a private bucket, so `/media/<resource>/<id>` is not something
 * a browser can load directly — the API checks access and mints a short-lived
 * signed URL. This asks for that URL as JSON (which carries the auth header
 * like any other request) and then puts the result straight into an `<img>`.
 *
 * **Why not point `<img src>` at the media path.** An `<img>` cannot send an
 * `Authorization` header, so the request would arrive unauthenticated. Reading
 * the endpoint's redirect with `fetch` instead would need CORS configured on
 * the bucket for a response nothing ever inspects. Fetching the URL as data and
 * letting the browser load the image normally avoids both.
 *
 * The signed URL is deliberately not cached across mounts: it expires, and a
 * stale one produces a broken image rather than a re-fetch. Resolving per mount
 * costs one small request and always yields a URL with its full lifetime ahead
 * of it.
 */
export interface MediaImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** A media path from the API, e.g. `/media/attendance/<id>`. */
  path: string | null | undefined;
  /** Rendered while resolving, and if resolution fails. */
  fallback?: React.ReactNode;
}

export const MediaImage = ({ path, fallback = null, alt = "", ...imgProps }: MediaImageProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }

    // Guards against a resolved URL from a previous path landing after this
    // effect has been superseded — a list that re-orders would otherwise show
    // one row's image against another's.
    let active = true;
    setFailed(false);

    api
      .get<MediaUrlResponse>(path)
      .then((res) => {
        if (active) setUrl(res.url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [path]);

  if (!path || failed || !url) return <>{fallback}</>;

  return <img src={url} alt={alt} {...imgProps} />;
};

/**
 * Opens a media path in a new tab.
 *
 * The tab is opened *before* the URL is resolved, and navigated afterwards.
 * Opening it after the await would be a popup the browser no longer attributes
 * to the click, and most blockers refuse it.
 */
export const openMediaInNewTab = async (path: string): Promise<void> => {
  const tab = window.open("", "_blank", "noopener,noreferrer");
  try {
    const res = await api.get<MediaUrlResponse>(path);
    if (tab) tab.location.href = res.url;
  } catch {
    tab?.close();
  }
};

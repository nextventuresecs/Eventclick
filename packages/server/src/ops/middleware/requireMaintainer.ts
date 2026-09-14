import { createHash } from "crypto";
import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Maintainer } from "../types";

export interface MaintainerLookup {
  query(text: string, values: unknown[]): Promise<{ rows: Array<{ id: string; email: string; display_name: string }> }>;
}

export interface RequireMaintainerDeps {
  /** opsReadPool. Queried on every request: removal from `maintainers` must take effect immediately. */
  pool: MaintainerLookup;
  logger: { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
  /** Dev/test only; ops/env.ts refuses to start with this set in production. */
  bypassEmail?: string;
  teamDomain?: string;
  audience?: string;
  /** Overridable for tests. Defaults to the Access JWKS, fetched and cached by jose. */
  keys?: JWTVerifyGetKey;
}

const ACCESS_HEADER = "cf-access-jwt-assertion";

const LOOKUP_SQL = "SELECT id, email, display_name FROM maintainers WHERE email = $1 AND is_active";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/**
 * The inner gate. Cloudflare Access is the outer one, but anything that can
 * reach ops-server on the docker network could send any header it likes, so
 * the Access JWT is verified here rather than trusted, and the email it names
 * must still be an active row in `maintainers`.
 */
export function createRequireMaintainer(deps: RequireMaintainerDeps): RequestHandler {
  const { pool, logger, bypassEmail, teamDomain, audience } = deps;

  let keys = deps.keys;
  if (!bypassEmail && !keys) {
    if (!teamDomain || !audience) {
      throw new Error("requireMaintainer needs teamDomain and audience unless bypassEmail is set");
    }
    // Built once: jose caches the key set and refetches on an unknown `kid`.
    keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", teamDomain));
  }

  return async (req, res, next) => {
    let email: string;

    if (bypassEmail) {
      email = bypassEmail;
    } else {
      const token = req.headers[ACCESS_HEADER];
      if (typeof token !== "string" || token === "") {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }

      try {
        const { payload } = await jwtVerify(token, keys!, {
          issuer: teamDomain,
          audience,
          algorithms: ["RS256"],
        });
        email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      } catch (err) {
        // The token itself is a bearer credential for the Access session and
        // is never logged.
        logger.warn(
          { reason: (err as { code?: string }).code ?? (err as Error).name },
          "ops access token rejected",
        );
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }

      if (!email) {
        logger.warn({ reason: "ERR_MISSING_EMAIL_CLAIM" }, "ops access token rejected");
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
    }

    let row: { id: string; email: string; display_name: string } | undefined;
    try {
      ({ rows: [row] } = await pool.query(LOOKUP_SQL, [email]));
    } catch (err) {
      logger.error({ err }, "ops maintainer lookup failed");
      res.status(503).json({ error: "AUTH_UNAVAILABLE" });
      return;
    }

    if (!row) {
      logger.warn({ emailSha256: sha256(email) }, "ops access refused: not an active maintainer");
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const maintainer: Maintainer = { id: row.id, email: row.email, displayName: row.display_name };
    req.maintainer = maintainer;
    next();
  };
}

import { Router } from "express";
import {
  OpsIdParamSchema,
  OpsUnmaskSchema,
  type OpsUnmaskResponse,
  type OpsUserDetailResponse,
} from "@application/shared";
import type { RespondAudited } from "../audit";
import { countRecentUnmasks, findMemberships, findUserById, readUnmasked, type ReadPool } from "../lookup";

export const UNMASK_LIMIT_PER_HOUR = 20;

const notFound = () => Object.assign(new Error("user not found"), { status: 404 });

/**
 * Serialises unmask requests per maintainer inside this process, so the
 * count-then-insert against the access log cannot be raced past the limit by
 * parallel requests. One ops-server instance is assumed (ADR 0002).
 */
function perKeyLock() {
  const tails = new Map<string, Promise<unknown>>();
  return async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    tails.set(key, tail);
    try {
      return await run;
    } finally {
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}

export function usersRouter(deps: { respondAudited: RespondAudited; readPool: ReadPool }) {
  const router = Router();
  const withUnmaskLock = perKeyLock();

  router.get("/users/:id", async (req, res) => {
    const { id } = OpsIdParamSchema.parse(req.params);

    await deps.respondAudited<OpsUserDetailResponse>(
      req,
      res,
      { action: "user.view", targetType: "user", targetId: id },
      async () => {
        const user = await findUserById(deps.readPool, id);
        if (!user) throw notFound();
        const memberships = await findMemberships(deps.readPool, id);
        return {
          body: { user, memberships },
          resultCount: 1,
          audit: { organizationId: user.organizationId ?? undefined },
        };
      },
    );
  });

  router.post("/users/:id/unmask", async (req, res) => {
    const { id } = OpsIdParamSchema.parse(req.params);
    // A non-JSON body (a cross-site form post) parses to nothing and fails here.
    const { reason } = OpsUnmaskSchema.parse(req.body ?? {});
    const maintainerId = req.maintainer!.id;

    await withUnmaskLock(maintainerId, async () => {
      // Checked before respondAudited: a refused unmask returns nothing, so it
      // writes no row and does not count against the limit.
      if ((await countRecentUnmasks(deps.readPool, maintainerId)) >= UNMASK_LIMIT_PER_HOUR) {
        res.status(429).json({ error: "UNMASK_LIMIT" });
        return;
      }

      await deps.respondAudited<OpsUnmaskResponse>(
        req,
        res,
        { action: "user.unmask", targetType: "user", targetId: id, reason },
        async () => {
          const raw = await readUnmasked(deps.readPool, id);
          if (!raw) throw notFound();
          return {
            body: { email: raw.email, fullName: raw.fullName },
            resultCount: 1,
            audit: { organizationId: raw.organizationId ?? undefined },
          };
        },
      );
    });
  });

  return router;
}

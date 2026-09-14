import { Router } from "express";
import type { OpsUsage } from "@application/shared";
import type { RespondAudited } from "../audit";
import type { ReadPool } from "../lookup";
import { readUsage } from "../usage";

export function usageRouter(deps: { respondAudited: RespondAudited; readPool: ReadPool }) {
  const router = Router();

  router.get("/usage", (req, res) =>
    deps.respondAudited<OpsUsage>(req, res, { action: "usage.view" }, async () => {
      const usage = await readUsage(deps.readPool);
      return { body: usage, resultCount: usage.orgs.length };
    }),
  );

  return router;
}

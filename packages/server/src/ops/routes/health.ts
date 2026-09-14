import { Router } from "express";
import type { OpsHealth } from "@application/shared";
import type { RespondAudited } from "../audit";
import { readHealth, type HealthDeps } from "../health";

export function healthRouter(deps: { respondAudited: RespondAudited; health: HealthDeps }) {
  const router = Router();

  // 200 once audited: probe failures are part of the body, not the status.
  router.get("/health", (req, res) =>
    deps.respondAudited<OpsHealth>(req, res, { action: "health.view" }, async () => ({
      body: await readHealth(deps.health),
    })),
  );

  return router;
}

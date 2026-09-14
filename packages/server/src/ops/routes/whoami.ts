import { Router } from "express";
import type { RespondAudited } from "../audit";

export function whoamiRouter(deps: { respondAudited: RespondAudited; release: string | null }) {
  const router = Router();

  router.get("/whoami", (req, res) =>
    deps.respondAudited(req, res, { action: "session.whoami" }, async () => ({
      body: {
        maintainer: req.maintainer!,
        release: deps.release,
        serverTime: new Date().toISOString(),
      },
    })),
  );

  return router;
}

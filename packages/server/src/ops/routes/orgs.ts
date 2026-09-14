import { Router } from "express";
import {
  OpsIdParamSchema,
  OpsOrgUsersQuerySchema,
  type OpsOrgDetailResponse,
  type OpsOrgUsersResponse,
} from "@application/shared";
import type { RespondAudited } from "../audit";
import { decodeCursor, findOrgById, listOrgUsers, type ReadPool } from "../lookup";

const notFound = () => Object.assign(new Error("organization not found"), { status: 404 });

export function orgsRouter(deps: { respondAudited: RespondAudited; readPool: ReadPool }) {
  const router = Router();

  router.get("/orgs/:id", async (req, res) => {
    const { id } = OpsIdParamSchema.parse(req.params);

    await deps.respondAudited<OpsOrgDetailResponse>(
      req,
      res,
      { action: "org.view", targetType: "org", targetId: id, organizationId: id },
      async () => {
        const org = await findOrgById(deps.readPool, id);
        if (!org) throw notFound();
        return { body: { org }, resultCount: 1 };
      },
    );
  });

  router.get("/orgs/:id/users", async (req, res) => {
    const { id } = OpsIdParamSchema.parse(req.params);
    // Parsed in the handler: Express 5's req.query cannot be replaced by middleware.
    const { cursor, limit } = OpsOrgUsersQuerySchema.parse(req.query);
    const position = cursor ? decodeCursor(cursor) : null;

    await deps.respondAudited<OpsOrgUsersResponse>(
      req,
      res,
      { action: "org.users.list", targetType: "org", targetId: id, organizationId: id },
      async () => {
        const org = await findOrgById(deps.readPool, id);
        if (!org) throw notFound();
        const page = await listOrgUsers(deps.readPool, id, limit, position);
        return { body: page, resultCount: page.users.length };
      },
    );
  });

  return router;
}

import { Router } from "express";
import { OpsSearchQuerySchema, type OpsSearchResponse, type OpsSearchResult } from "@application/shared";
import type { RespondAudited } from "../audit";
import { classifyQuery, searchQuerySha256 } from "../search";
import { findOrgById, findOrgBySlug, findUserByEmail, findUserById, type ReadPool } from "../lookup";

export function searchRouter(deps: { respondAudited: RespondAudited; readPool: ReadPool }) {
  const router = Router();

  router.get("/search", async (req, res) => {
    const { q } = OpsSearchQuerySchema.parse(req.query);
    const cls = classifyQuery(q);

    await deps.respondAudited<OpsSearchResponse>(
      req,
      res,
      // Zero-result searches are audited too; the term itself is never stored.
      { action: "search", query: { kind: cls.kind, qSha256: searchQuerySha256(q) } },
      async () => {
        const results: OpsSearchResult[] = [];

        if (cls.kind === "id") {
          const user = await findUserById(deps.readPool, cls.value);
          if (user) results.push({ kind: "user", user });
          const org = await findOrgById(deps.readPool, cls.value);
          if (org) results.push({ kind: "org", org });
        } else if (cls.kind === "email") {
          const user = await findUserByEmail(deps.readPool, cls.value);
          if (user) results.push({ kind: "user", user });
        } else if (cls.kind === "slug" || cls.kind === "slugOrRequest") {
          const org = await findOrgBySlug(deps.readPool, cls.value);
          if (org) results.push({ kind: "org", org });
          else if (cls.kind === "slugOrRequest") results.push({ kind: "request", requestId: cls.value });
        } else if (cls.kind === "request") {
          results.push({ kind: "request", requestId: cls.value });
        }

        return { body: { results }, resultCount: results.length };
      },
    );
  });

  return router;
}

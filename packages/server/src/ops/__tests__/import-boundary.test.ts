import { describe, it, expect } from "vitest";
import path from "path";
import { ESLint } from "eslint";

/**
 * Lint fixtures for the ops-server boundary in eslint.config.mjs. Lints source
 * text as if it lived at a given path; no fixture files are written.
 */
const serverDir = path.resolve(__dirname, "../../..");
const eslint = new ESLint({ cwd: serverDir });

const lint = async (relativeFile: string, code: string) => {
  const [result] = await eslint.lintText(code, { filePath: path.join(serverDir, relativeFile) });
  return result!.messages
    .filter((m) => m.ruleId === "local/ops-boundary" || m.ruleId === "no-restricted-syntax")
    .map((m) => m.ruleId);
};

describe("ops import boundary", () => {
  it.each([
    ["src/ops/app.ts", 'import { db } from "../db";'],
    ["src/ops/app.ts", 'import { db } from "../db/index";'],
    ["src/ops/app.ts", 'import { env } from "../config/env";'],
    ["src/ops/app.ts", 'import { logger } from "../utils/logger";'],
    ["src/ops/routes/whoami.ts", 'import { requireAuth } from "../../middleware/auth";'],
    ["src/ops/middleware/x.ts", 'import { apiRouter } from "../../routes";'],
    ["src/ops/app.ts", 'import { thing } from "../services/user.service";'],
    ["src/ops-entry.ts", 'import { env } from "./config/env";'],
    ["src/ops/audit.ts", 'import { maintainers } from "../db/schema/maintainers";'],
  ])("rejects %s importing tenant code: %s", async (file, code) => {
    expect(await lint(file, code)).toContain("local/ops-boundary");
  });

  it.each([
    ["src/ops/app.ts", 'import { REDACT_PATHS } from "../utils/redact";'],
    ["src/ops/audit.ts", 'import type { MaintainerAccessAction } from "../db/schema/maintainerAccessLog";'],
    ["src/ops/routes/whoami.ts", 'import type { RespondAudited } from "../audit";'],
    ["src/ops/app.ts", 'import { createRequireMaintainer } from "./middleware/requireMaintainer";'],
    ["src/ops-entry.ts", 'import { loadOpsEnv } from "./ops/env";'],
    ["src/__tests__/x.integration.test.ts", 'import { createOpsApp } from "../ops/app";'],
  ])("allows %s: %s", async (file, code) => {
    expect(await lint(file, code)).toEqual([]);
  });

  it("rejects tenant code importing ops-server", async () => {
    expect(await lint("src/routes/index.ts", 'import { createOpsApp } from "../ops/app";')).toContain(
      "local/ops-boundary",
    );
  });

  it("rejects write SQL anywhere under src/ops except audit.ts", async () => {
    const sql = 'export const q = "UPDATE maintainers SET is_active = false";';
    expect(await lint("src/ops/routes/users.ts", sql)).toContain("no-restricted-syntax");
    expect(await lint("src/ops/audit.ts", 'export const q = "INSERT INTO maintainer_access_log VALUES (1)";')).toEqual([]);
  });
});

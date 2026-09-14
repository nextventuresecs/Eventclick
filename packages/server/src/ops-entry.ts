import path from "node:path";
import dotenv from "dotenv";
import { loadOpsEnv } from "./ops/env";
import { createOpsLogger } from "./ops/logger";
import { createOpsPools } from "./ops/db";
import { createOpsApp } from "./ops/app";

/**
 * Ops Console entrypoint: a separate process from the tenant server, run from
 * the same image (compare worker-entry.ts). It holds only the maintainer
 * database credentials and never loads config/env.ts.
 */

// Local development only; the production container passes variables explicitly.
for (const p of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  dotenv.config({ path: p, quiet: true });
}

const env = loadOpsEnv();
const logger = createOpsLogger(env);
const pools = createOpsPools(env);

for (const [name, pool] of Object.entries(pools)) {
  // An idle client erroring (Postgres restart) must not crash the process.
  pool.on("error", (err) => logger.error({ err, pool: name }, "ops pool idle client error"));
}

const app = createOpsApp({ env, readPool: pools.read, auditPool: pools.audit, logger });

const server = app.listen(env.OPS_PORT, () => {
  logger.info(
    { port: env.OPS_PORT, authBypass: Boolean(env.OPS_AUTH_BYPASS_EMAIL) },
    "ops-server listening",
  );
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down ops-server…`);

  server.close(async (err) => {
    if (err) logger.error({ err }, "Error during ops-server close");
    await Promise.allSettled([pools.read.end(), pools.audit.end()]);
    process.exit(0);
  });

  // Keep-alive connections would otherwise hold close() open past the
  // container's stop timeout.
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 8_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

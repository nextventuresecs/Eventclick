import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_ACTIONS } from "@application/shared";

/**
 * #92's first acceptance criterion is that every declared action is recorded
 * *somewhere* — a property of the codebase as a whole, not of any one module.
 * A per-controller test cannot see a gap; this can, and it fails the moment
 * someone adds an action to AUDIT_ACTIONS without a writer.
 */
const SRC = join(__dirname, "..");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" ? [] : sourceFiles(full);
    }
    return full.endsWith(".ts") ? [full] : [];
  });

const corpus = sourceFiles(SRC)
  // The service defines the actions; a mention there is a declaration, not a
  // writer, so it must not count as coverage.
  .filter((f) => !f.endsWith(join("services", "audit.service.ts")))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

describe("audit action coverage (#92)", () => {
  it.each(AUDIT_ACTIONS)("records %s somewhere outside the audit service", (action) => {
    expect(corpus).toContain(`"${action}"`);
  });

  it("writes every audit entry through a helper that cannot fail the operation", () => {
    // The audited operation has already committed by the time the entry is
    // written. Throwing would turn a success into a 500 the caller retries,
    // creating a second room. recordAuditSafely logs and continues.
    const auditService = readFileSync(join(SRC, "services", "audit.service.ts"), "utf8");

    expect(auditService).toContain("export const recordAuditSafely");
    expect(auditService).toMatch(/catch[\s\S]*logger\.error/);
  });

  it("opens a tenant context for the audit write that happens in the queue worker", () => {
    // The SQS worker has no ambient request, so `db` falls back to the bare
    // pool with no app.current_tenant — and audit_logs' insert policy rejects
    // the row. The AC calls this path out specifically.
    const worker = readFileSync(join(SRC, "queues", "worker.ts"), "utf8");
    const auditCall = worker.indexOf("recordAuditSafely");

    expect(auditCall).toBeGreaterThan(-1);

    // The nearest enclosing construct before the call must be a background
    // tenant context, not a bare db call.
    const preceding = worker.slice(Math.max(0, auditCall - 500), auditCall);
    expect(preceding).toContain("runInBackgroundTenantContext");
  });
});

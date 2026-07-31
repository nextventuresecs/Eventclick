import { db } from "../db";
import { bugReports } from "../db/schema";
import type { SubmitBugReportInput } from "@application/shared";
import { ApiError } from "../utils/errors";
import { logger } from "../utils/logger";

export const submitBugReport = async (
  userId: string,
  organizationId: string | null,
  input: SubmitBugReportInput
) => {
  const [createdBugReport] = await db
    .insert(bugReports)
    .values({
      userId,
      organizationId: organizationId || null,
      severity: input.severity,
      component: input.component,
      title: input.title,
      steps: input.steps,
      expected: input.expected,
      actual: input.actual,
      systemInfo: input.systemInfo || null,
      status: "open",
    })
    .returning();

  if (!createdBugReport) {
    throw ApiError.internal("Failed to submit bug report");
  }

  logger.info({ userId, event: "bug_report.submitted" }, "Bug report submitted");
  return createdBugReport;
};

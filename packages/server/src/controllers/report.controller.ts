import type { RequestHandler } from "express";
import { randomUUID } from "crypto";
import { ApiError } from "../utils/errors";
import { generateVerificationReportPdf } from "../services/report.service";
import { enqueuePdfJob } from "../queues/sqs.client";
import { notifyReportGenerated } from "../services/report-notification.service";
import { recordAuditSafely } from "../services/audit.service";
import { env } from "../config/env";
import { PDF_SYNC_RENDER_MARGIN_MS } from "../config/constants";
import { logger } from "../utils/logger";

const requireOrgId = (organizationId: string | null): string => {
  if (!organizationId) throw ApiError.badRequest("User has no organization");
  return organizationId;
};

export const downloadRoomReportPdf: RequestHandler = async (req, res, next) => {
  try {
    const orgId = requireOrgId(req.user!.organizationId);
    const roomId = req.params.id as string;

    logger.info(
      { roomId, orgId, userId: req.user!.id },
      "PDF report generation requested"
    );

    // Two paths, and which one runs depends purely on configuration:
    //
    //   SQS_PDF_QUEUE_URL set    → 202 + jobId; the worker renders it, with a
    //                              generous deadline and no request waiting.
    //                              This is the production shape.
    //   SQS_PDF_QUEUE_URL unset  → rendered inline, below, bounded by the
    //                              request timeout. Intended for local
    //                              development and small events.
    //
    // The synchronous path is retained rather than removed because it is what
    // makes the product work without SQS configured at all.
    if (env.SQS_PDF_QUEUE_URL) {
      const job = await enqueuePdfJob({ roomId, orgId, userId: req.user!.id });
      return res.status(202).json({ jobId: job.jobId });
    }

    // The renderer's deadline must land INSIDE the server's request timeout.
    // It used to be a flat 120s against a 30s request timeout, so the request
    // was always killed first and Gotenberg carried on rendering a report
    // nobody was waiting for — and its queue is small, so that orphaned work
    // crowded out live requests.
    const renderTimeoutMs = Math.max(
      1_000,
      env.SERVER_REQUEST_TIMEOUT_MS - PDF_SYNC_RENDER_MARGIN_MS,
    );

    // Abort the render if the caller hangs up before it finishes.
    const callerGone = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) callerGone.abort();
    };
    req.on("close", onClose);

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateVerificationReportPdf(roomId, orgId, req.user!, {
        timeoutMs: renderTimeoutMs,
        signal: callerGone.signal,
      });
    } finally {
      req.off("close", onClose);
    }

    // The caller left while we were rendering: there is nobody to send this
    // to, and writing to a closed socket would throw.
    if (callerGone.signal.aborted || res.writableEnded) {
      logger.warn({ roomId, orgId }, "PDF report abandoned by caller before delivery");
      return;
    }

    // Inline path (no SQS_PDF_QUEUE_URL): runs inside the request's own
    // tenant context, so no runInBackgroundTenantContext wrapper is needed
    // (contrast with the async worker path in queues/worker.ts). There's no
    // persisted pdf_jobs row here to hang a stable reportId off of — this
    // download was never durable, so a fresh id is fine for metadata only.
    //
    // Awaited before the response ends, NOT fire-and-forget: tenantContext's
    // res.on("finish") handler commits and releases the pinned connection the
    // moment we respond, and the `db` proxy would still be resolving to that
    // released client for the rest of the fan-out's queries. Same reasoning as
    // the awaited wrappers in queues/worker.ts. The .catch() keeps a fan-out
    // failure from breaking the download — the PDF is what was asked for.
    await notifyReportGenerated(
      roomId,
      orgId,
      randomUUID(),
      req.user!.id,
      req.user!.email ?? "A team member",
    ).catch((err) => logger.error({ err, roomId }, "REPORT_GENERATED fan-out failed"));

    // Inside the request's own tenant context, like the fan-out above.
    await recordAuditSafely({
      organizationId: orgId,
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: "report.generated",
      resourceType: "report",
      resourceId: roomId,
      newValues: { roomId, delivery: "inline_download" },
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Official-Event-Report-${roomId}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.status(200).end(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

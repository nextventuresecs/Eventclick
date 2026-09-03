import { and, eq, isNull } from "drizzle-orm";
import ejs from "ejs";
import path from "path";
import type { UserRole } from "@application/shared";
import { db } from "../db";
import { eventRooms, organizations, attendanceEntries, activitySubmissions, activityPhotos } from "../db/schema";
import { ApiError } from "../utils/errors";
import { env } from "../config/env";
import { assertRoomAccessForUser } from "./event-assignment.service";
import { logger } from "../utils/logger";

/**
 * Calculates human-readable fieldwork run-time.
 */
const formatDuration = (start: Date | null, end: Date | null, status: string): string => {
  if (!start) return "N/A";
  
  const endTime = end ? new Date(end).getTime() : Date.now();
  const startTime = new Date(start).getTime();
  const diffMs = endTime - startTime;
  
  if (diffMs < 0) return "0 minutes";
  
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  let formatted = "";
  if (hours > 0) {
    formatted += `${hours} hour${hours > 1 ? "s" : ""} `;
  }
  if (minutes > 0 || formatted === "") {
    formatted += `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  
  if (!end && status === "live") {
    return `${formatted.trim()} (Active Session)`;
  }
  
  return formatted.trim();
};

/**
 * Generates objective fieldwork verification PDF report buffer using Gotenberg.
 */
export const generateVerificationReportPdf = async (
  roomId: string,
  orgId: string,
  user: { id: string; role: UserRole; organizationId: string | null },
): Promise<Buffer> => {
  // 1. Fetch Room details
  const [room] = await db
    .select()
    .from(eventRooms)
    .where(
      and(
        eq(eventRooms.id, roomId),
        eq(eventRooms.organizationId, orgId),
        isNull(eventRooms.deletedAt),
      ),
    )
    .limit(1);

  if (!room) {
    throw ApiError.notFound("Room not found");
  }

  if (room.status !== "ended") {
    throw ApiError.badRequest("Report can only be generated after the live session has ended");
  }

  // 2. Assert User has permission to access the room and verify room is in org.
  await assertRoomAccessForUser(user, orgId, roomId);

  // 3. Fetch Organization details
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!organization) {
    throw ApiError.notFound("Organization not found");
  }

  // 4. Fetch Attendance Entries
  const entries = await db
    .select()
    .from(attendanceEntries)
    .where(eq(attendanceEntries.roomId, roomId))
    .orderBy(attendanceEntries.submittedAt);

  // 5. Fetch Activity Submissions and Photos
  const submissionsData = await db
    .select()
    .from(activitySubmissions)
    .where(eq(activitySubmissions.roomId, roomId));

  const allPhotos = await db
    .select()
    .from(activityPhotos)
    .where(eq(activityPhotos.roomId, roomId));

  const photosBySubmission = new Map<string, typeof allPhotos>();
  for (const photo of allPhotos) {
    if (!photosBySubmission.has(photo.submissionId)) {
      photosBySubmission.set(photo.submissionId, []);
    }
    photosBySubmission.get(photo.submissionId)!.push(photo);
  }

  const submissions = submissionsData.map(s => ({
    ...s,
    photos: photosBySubmission.get(s.id) || []
  }));

  // 6. Compile EJS Template
  const templatePath = path.join(__dirname, "../templates/report.ejs");
  let htmlContent = await ejs.renderFile(templatePath, {
    room,
    organization,
    attendanceCount: entries.length,
    attendanceEntries: entries,
    activitySubmissions: submissions,
    formattedDuration: formatDuration(room.actualStart, room.actualEnd, room.status),
  });

  // 7. Rewrite local development S3 URLs for Gotenberg container
  if (env.NODE_ENV === "development") {
    const publicEndpoint = env.S3_PUBLIC_ENDPOINT.replace(/\/+$/, "");
    const internalEndpoint = env.S3_ENDPOINT.replace(/\/+$/, "");
    htmlContent = htmlContent.replaceAll(publicEndpoint, internalEndpoint);
  }

  // 8. Call Gotenberg Chromium PDF conversion
  const formData = new FormData();
  formData.append(
    "files",
    new Blob([htmlContent], { type: "text/html" }),
    "index.html"
  );
  
  // Set margin to zero so CSS padding rules in report.ejs are preserved
  formData.append("marginTop", "0");
  formData.append("marginBottom", "0");
  formData.append("marginLeft", "0");
  formData.append("marginRight", "0");

  const gotenbergUrl = `${env.GOTENBERG_URL.replace(/\/+$/, "")}/forms/chromium/convert/html`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    const response = await fetch(gotenbergUrl, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Gotenberg returned status ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error: any) {
    // Structured, not console.error: the production logger emits JSON, so a
    // bare console line is unparseable by log aggregation and carries no
    // level, service or redaction. roomId is what is available here — this
    // service has no request-scoped logger (see #82 for request-id tagging).
    logger.error({ err: error, roomId, gotenbergUrl }, "PDF generation failed via Gotenberg");
    throw ApiError.internal(`PDF generation failed: ${error.message || error}`);
  }
};

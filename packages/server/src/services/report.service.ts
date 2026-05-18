import { and, eq, isNull } from "drizzle-orm";
import ejs from "ejs";
import path from "path";
import { db } from "../db";
import { eventRooms, organizations, attendanceEntries, activitySubmissions } from "../db/schema";
import { ApiError } from "../utils/errors";
import { env } from "../config/env";
import { assertRoomAccessForUser } from "./event-assignment.service";

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
  user: any,
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

  // 2. Assert User has permission to access the room
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

  // 5. Fetch Activity Submissions
  const submissions = await db
    .select()
    .from(activitySubmissions)
    .where(eq(activitySubmissions.roomId, roomId));

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
    const response = await fetch(gotenbergUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Gotenberg returned status ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error: any) {
    console.error("PDF generation failed via Gotenberg:", error);
    throw ApiError.internal(`PDF generation failed: ${error.message || error}`);
  }
};

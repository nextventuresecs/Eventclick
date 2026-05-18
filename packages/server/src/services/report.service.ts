import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "../db";
import {
  eventRooms,
  organizations,
  attendanceEntries,
  activitySubmissions,
  roomReports,
} from "../db/schema";
import { ApiError } from "../utils/errors";
import { buildPublicUrl, s3 } from "./storage.service";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env";
import ejs from "ejs";
import path from "path";
import crypto from "crypto";

/**
 * Maps local S3/MinIO URLs to Docker's internal host (minio:9000)
 * so Gotenberg running in the same Docker network can resolve proof photos and logos.
 */
const resolveLocalS3UrlForDocker = (url: string | null | undefined): string => {
  if (!url) return "";
  const publicEndpoint = env.S3_PUBLIC_ENDPOINT;
  const internalEndpoint = env.S3_ENDPOINT;

  if (publicEndpoint.includes("localhost") || publicEndpoint.includes("127.0.0.1")) {
    return url.replace(publicEndpoint, internalEndpoint);
  }
  return url;
};

/**
 * Generates an event PDF report, uploads it to S3, and persists the record.
 */
export const generateRoomReport = async (
  roomId: string,
  orgId: string,
  userId: string,
): Promise<any> => {
  // 1. Fetch room details
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
    throw ApiError.notFound("Event room not found");
  }

  // 2. Fetch organization details
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw ApiError.notFound("Organization not found");
  }

  // 3. Count beneficiaries (attendance entries)
  const [attendanceCountRes] = await db
    .select({ count: db.$count(attendanceEntries) })
    .from(attendanceEntries)
    .where(eq(attendanceEntries.roomId, roomId));

  const beneficiaryCount = attendanceCountRes?.count ?? 0;

  // 4. Fetch all activity submissions for photo proofs
  const submissions = await db
    .select()
    .from(activitySubmissions)
    .where(eq(activitySubmissions.roomId, roomId));

  // 5. Calculate dynamic event duration
  let durationText = "N/A";
  if (room.actualStart && room.actualEnd) {
    const diffMs = room.actualEnd.getTime() - room.actualStart.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    durationText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} mins`;
  } else if (room.actualStart) {
    durationText = "In Progress";
  }

  // 6. Compile data for the EJS template
  const resolvedLogoUrl = resolveLocalS3UrlForDocker(org.logoUrl);
  const templatePath = path.join(__dirname, "../templates/report.ejs");

  const html = await ejs.renderFile(templatePath, {
    organization: {
      name: org.name,
      logoUrl: resolvedLogoUrl,
    },
    event: {
      title: room.title,
      description: room.description,
    },
    durationText,
    beneficiaryCount,
    actualStartText: room.actualStart
      ? room.actualStart.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
      : "N/A",
    actualEndText: room.actualEnd
      ? room.actualEnd.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
      : "N/A",
    activities: room.activityDefinitions.map((def) => {
      const matchingSubmissions = submissions.filter((sub) => sub.activityId === def.id);
      const photos = matchingSubmissions.flatMap((sub) =>
        (sub.photos || []).map((p) => ({
          ...p,
          url: resolveLocalS3UrlForDocker(p.url),
        })),
      );
      return {
        title: def.title,
        description: def.description,
        photos,
      };
    }),
  });

  // 7. Request Gotenberg to render HTML to a professional PDF
  const gotenbergUrl = `${env.GOTENBERG_URL}/forms/chromium/convert/html`;
  const formData = new FormData();
  const htmlBlob = new Blob([html], { type: "text/html" });
  
  formData.append("files", htmlBlob, "index.html");
  formData.append("printBackground", "true");
  formData.append("preferCssPageSize", "true");

  const response = await fetch(gotenbergUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw ApiError.internal(`Gotenberg PDF generation failed: ${response.statusText} (${errorText})`);
  }

  const pdfBuffer = Buffer.from(await response.arrayBuffer());

  // 8. Upload generated PDF to S3/MinIO
  const key = `reports/${roomId}/${crypto.randomUUID()}.pdf`;
  const fileName = `${room.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_report.pdf`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    }),
  );

  // 9. Persist the report record in the database
  const [reportRecord] = await db
    .insert(roomReports)
    .values({
      roomId,
      s3Key: key,
      fileName,
      fileSize: pdfBuffer.length,
      generatedBy: userId,
    })
    .returning();

  if (!reportRecord) {
    throw ApiError.internal("Failed to save report record");
  }

  return {
    ...reportRecord,
    downloadUrl: buildPublicUrl(reportRecord.s3Key),
  };
};

/**
 * Retrieves all generated PDF reports for an event room.
 */
export const getRoomReports = async (
  roomId: string,
  orgId: string,
): Promise<any[]> => {
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
    throw ApiError.notFound("Event room not found");
  }

  const reports = await db
    .select()
    .from(roomReports)
    .where(eq(roomReports.roomId, roomId))
    .orderBy(desc(roomReports.createdAt));

  return reports.map((r) => ({
    ...r,
    downloadUrl: buildPublicUrl(r.s3Key),
  }));
};

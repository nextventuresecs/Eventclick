import { db } from "../db";
import { attendanceEntries, activityPhotos, roomRecordings, activitySubmissions } from "../db/schema";
import { lt } from "drizzle-orm";

export async function purgeExpiredData() {
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  await db.delete(attendanceEntries).where(lt(attendanceEntries.submittedAt, cutoff));
  await db.delete(activityPhotos).where(lt(activityPhotos.createdAt, cutoff));
  await db.delete(activitySubmissions).where(lt(activitySubmissions.createdAt, cutoff));
  await db.delete(roomRecordings).where(lt(roomRecordings.createdAt, cutoff));
}

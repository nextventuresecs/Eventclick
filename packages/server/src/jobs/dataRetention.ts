import { db, withJobStatementTimeout } from "../db";
import { attendanceEntries, activityPhotos, roomRecordings, activitySubmissions } from "../db/schema";
import { lt } from "drizzle-orm";

export async function purgeExpiredData() {
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  // Bulk deletes over a year of rows outrun the pool's request-shaped
  // statement_timeout (DB_STATEMENT_TIMEOUT, 15s) on the first real run and
  // would be cancelled with SQLSTATE 57014. The job raises the limit for its
  // own transaction rather than the default being loosened for every request.
  await withJobStatementTimeout(db, async (tx) => {
    await tx.delete(attendanceEntries).where(lt(attendanceEntries.submittedAt, cutoff));
    await tx.delete(activityPhotos).where(lt(activityPhotos.createdAt, cutoff));
    await tx.delete(activitySubmissions).where(lt(activitySubmissions.createdAt, cutoff));
    await tx.delete(roomRecordings).where(lt(roomRecordings.createdAt, cutoff));
  });
}

import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  console.log("Connecting to:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"));

  const total = await pool.query("SELECT count(*) FROM attendance_entries");
  console.log("\nTotal attendance_entries:", total.rows[0].count);

  const perRoom = await pool.query(
    "SELECT room_id, count(*), cast(count(*) as int) as count_int FROM attendance_entries GROUP BY room_id"
  );
  console.log("\nPer-room counts:", JSON.stringify(perRoom.rows, null, 2));

  if (perRoom.rows.length > 0) {
    const row = perRoom.rows[0];
    console.log("\n--- Type Analysis ---");
    console.log("count() -> typeof:", typeof row.count, "value:", JSON.stringify(row.count));
    console.log("cast(count(*) as int) -> typeof:", typeof row.count_int, "value:", JSON.stringify(row.count_int));
  }

  const rooms = await pool.query("SELECT id, title FROM event_rooms WHERE deleted_at IS NULL ORDER BY created_at DESC");
  console.log("\n--- Room Cross-Reference ---");
  for (const room of rooms.rows) {
    const att = await pool.query("SELECT count(*) FROM attendance_entries WHERE room_id = $1", [room.id]);
    console.log(`"${room.title}" (${room.id.substring(0,8)}...): ${att.rows[0].count} entries`);
  }
} catch (err) {
  console.error("Error:", err.message || err);
} finally {
  await pool.end();
}

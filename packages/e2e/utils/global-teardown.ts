import { truncateAllTables } from "../utils/db";

export default async function globalTeardown() {
  await truncateAllTables();
}

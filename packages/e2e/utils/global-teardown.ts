import { truncateAllTables } from "./db";

export default async function globalTeardown() {
  await truncateAllTables();
}

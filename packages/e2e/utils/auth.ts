import { type Page } from "@playwright/test";
import { readFile } from "fs/promises";

export async function getTokenFromStorageState(storageStatePath: string): Promise<string | null> {
  try {
    const content = await readFile(storageStatePath, "utf-8");
    const state = JSON.parse(content);
    const cookie = state.cookies?.find((c: any) => c.name === "Eventclick_rt");
    return cookie?.value || null;
  } catch {
    return null;
  }
}

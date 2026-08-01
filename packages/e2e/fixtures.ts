import { test as base, type Page, type APIRequestContext } from "@playwright/test";
import { resetDb } from "./utils/db";

type Fixtures = {
  dbClean: void;
};

export const test = base.extend<Fixtures>({
  dbClean: [async ({}, use) => {
    await resetDb();
    await use();
  }, { auto: true }],
});

export { expect } from "@playwright/test";
export type { Page, APIRequestContext } from "@playwright/test";

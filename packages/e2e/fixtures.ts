import { test as base, type APIRequestContext } from "@playwright/test";
import { resetDb } from "./utils/db";
import { loadTokens, type StoredTokens } from "./utils/api-helpers";

type Fixtures = {
  dbClean: void;
  tokens: StoredTokens;
  adminToken: string;
  volunteerToken: string;
};

export const test = base.extend<Fixtures>({
  dbClean: [async ({}, use) => {
    await resetDb();
    await use();
  }, {}],

  tokens: async ({}, use) => {
    await use(loadTokens());
  },

  adminToken: async ({ tokens }, use) => {
    await use(tokens.adminAccessToken);
  },

  volunteerToken: async ({ tokens }, use) => {
    await use(tokens.volunteerAccessToken);
  },
});

export { expect } from "@playwright/test";
export type { Page, APIRequestContext } from "@playwright/test";

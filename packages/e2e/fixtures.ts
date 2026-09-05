import { test as base, type Page } from "@playwright/test";
import { resetDb } from "./utils/db";
import { loginUser } from "./utils/api-helpers";

const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL || "admin@test.com";
const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD!;
const volunteerEmail = process.env.PLAYWRIGHT_VOLUNTEER_EMAIL || "volunteer@test.com";
const volunteerPassword = process.env.PLAYWRIGHT_VOLUNTEER_PASSWORD!;
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const cookieDomain = new URL(BASE_URL).hostname;

type Options = {
  role: "admin" | "volunteer" | "none";
};

type Fixtures = {
  dbClean: void;
  adminToken: string;
  volunteerToken: string;
};

export const test = base.extend<Options & Fixtures>({
  role: ["admin", { option: true }],

  dbClean: [async ({}, use) => {
    await resetDb();
    await use();
  }, {}],

  page: async ({ page, request, role }, use) => {
    // Arrive with cookie consent already recorded.
    //
    // The consent banner is fixed to the bottom-right at z-[100], which is
    // exactly where a form's primary action sits. Without this it intercepts
    // the click on "Create Room" and the test fails as a 60s timeout with
    // "subtree intercepts pointer events" — intermittently, because whether
    // the two overlap depends on viewport and scroll position.
    //
    // Setting it is also the more realistic state: every test here is a
    // signed-in user, and a signed-in user has already answered the banner.
    await page.context().addCookies([
      {
        name: "eventclick_consent",
        value: encodeURIComponent(
          JSON.stringify({ analytics: false, marketing: false, timestamp: Date.now() }),
        ),
        domain: cookieDomain,
        path: "/",
      },
    ]);

    if (role !== "none") {
      const email = role === "volunteer" ? volunteerEmail : adminEmail;
      const password = role === "volunteer" ? volunteerPassword : adminPassword;

      if (password) {
        // Issue fresh session per test to allow independent Refresh Token Rotation
        const { refreshToken } = await loginUser(request, email, password);
        if (refreshToken) {
          await page.context().addCookies([
            {
              name: "Eventclick_rt",
              value: refreshToken,
              domain: cookieDomain,
              path: "/",
              httpOnly: true,
              sameSite: "Lax",
            },
          ]);
        }
      }
    }

    await use(page);
    await page.goto("about:blank").catch(() => {});
  },

  adminToken: async ({ request }, use) => {
    const { accessToken } = await loginUser(request, adminEmail, adminPassword);
    await use(accessToken);
  },

  volunteerToken: async ({ request }, use) => {
    const { accessToken } = await loginUser(request, volunteerEmail, volunteerPassword);
    await use(accessToken);
  },
});

export { expect } from "@playwright/test";
export type { Page, APIRequestContext } from "@playwright/test";

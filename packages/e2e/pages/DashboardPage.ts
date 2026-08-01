import { type Page, type Locator } from "@playwright/test";

export class DashboardPage {
  readonly page: Page;
  readonly createRoomButton: Locator;
  readonly roomCards: Locator;
  readonly metricCards: Locator;
  readonly welcomeHeading: Locator;
  readonly reportsLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createRoomButton = page.getByRole("link", { name: /create room/i }).first();
    this.roomCards = page.locator(".card-static");
    this.metricCards = page.getByText(/total event rooms|verified members|available reports|total attendees/i);
    this.welcomeHeading = page.getByRole("heading", { name: /welcome back/i });
    this.reportsLink = page.getByRole("link", { name: /download pdf reports/i });
  }

  async goto(baseURL: string) {
    await this.page.goto(`${baseURL}/dashboard`);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async clickCreateRoom() {
    await this.createRoomButton.click();
    await this.page.waitForURL((url) => url.pathname.includes("/rooms/create"), { timeout: 15000 });
  }

  async clickReports() {
    await this.reportsLink.click();
    await this.page.waitForURL((url) => url.pathname === "/reports", { timeout: 15000 });
  }

  async getRoomCardByTitle(title: string) {
    return this.page.locator(".card-static").filter({ hasText: new RegExp(title, "i") });
  }
}

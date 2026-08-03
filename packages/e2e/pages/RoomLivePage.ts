import { type Page, type Locator } from "@playwright/test";

export class RoomLivePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly activityButtons: Locator;
  readonly capturePhotoButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /.+/ }).first();
    this.activityButtons = page.locator("button").filter({ hasText: /required|in progress|verified/i });
    this.capturePhotoButton = page.getByRole("button", { name: /capture photo/i });
    this.backButton = page.getByRole("link", { name: "" }).filter({ has: page.locator("svg") }).first();
  }

  async goto(baseURL: string, roomId: string) {
    await this.page.goto(`${baseURL}/rooms/${roomId}/live`);
    await this.page.waitForLoadState("load");
  }

  async expandActivity(activityTitle: string) {
    const activityButton = this.page.locator("button").filter({ hasText: new RegExp(activityTitle, "i") });
    await activityButton.click();
  }

  async goBack() {
    await this.backButton.click();
    await this.page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 15000 });
  }
}

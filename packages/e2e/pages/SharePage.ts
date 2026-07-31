import { type Page, type Locator } from "@playwright/test";

export class SharePage {
  readonly page: Page;
  readonly notFoundHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.notFoundHeading = page.getByRole("heading", { name: /not found|page does not exist|invalid/i });
  }

  async goto(baseURL: string, token: string) {
    await this.page.goto(`${baseURL}/watch/${token}`);
    await this.page.waitForLoadState("networkidle");
  }
}

import { type Page, type Locator } from "@playwright/test";

export class ReportsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly downloadButtons: Locator;
  readonly noReportsMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: /^reports$/i }).first();
    this.searchInput = page.getByPlaceholder(/search reports/i);
    this.downloadButtons = page.getByRole("button", { name: /download report/i });
    this.noReportsMessage = page.getByText(/no reports available yet/i);
  }

  async goto(baseURL: string) {
    await this.page.goto(`${baseURL}/reports`);
    await this.page.waitForLoadState("load");
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async downloadReport(roomTitle: string) {
    const reportCard = this.page.locator(".card-static").filter({ hasText: new RegExp(roomTitle, "i") });
    const downloadButton = reportCard.getByRole("button", { name: /download report/i });
    await downloadButton.click();
  }

  async waitForDownload(roomTitle: string) {
    const reportCard = this.page.locator(".card-static").filter({ hasText: new RegExp(roomTitle, "i") });
    const generatingText = reportCard.getByText(/generating pdf/i);
    await generatingText.waitFor({ state: "hidden", timeout: 30000 });
  }
}

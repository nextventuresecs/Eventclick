import { type Page, type Locator } from "@playwright/test";

export class AttendancePage {
  readonly page: Page;
  readonly submitButton: Locator;
  readonly heading: Locator;
  readonly openCameraButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.submitButton = page.getByRole("button", { name: /submit attendance record/i });
    this.heading = page.getByRole("heading", { name: /submit attendance record/i });
    this.openCameraButton = page.getByRole("button", { name: /open camera/i });
    this.backButton = page.getByRole("link", { name: "" }).filter({ has: page.locator("svg") }).first();
  }

  async goto(baseURL: string, roomId: string) {
    await this.page.goto(`${baseURL}/rooms/${roomId}/attendance`);
    await this.page.waitForLoadState("load");
  }

  async fillField(fieldId: string, value: string) {
    const input = this.page.locator(`#${fieldId}`);
    await input.fill(value);
  }

  async selectOption(fieldId: string, value: string) {
    const select = this.page.locator(`#${fieldId}`);
    await select.selectOption(value);
  }

  async checkCheckbox(fieldId: string) {
    const checkbox = this.page.locator(`#${fieldId}`);
    await checkbox.check();
  }

  async submit() {
    await this.submitButton.click();
  }

  async goBack() {
    await this.backButton.click();
    await this.page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 15000 });
  }
}

import { type Page, type Locator } from "@playwright/test";

export class RegisterPage {
  readonly page: Page;
  readonly fullNameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly organizationNameInput: Locator;
  readonly termsCheckbox: Locator;
  readonly submitButton: Locator;
  readonly heading: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.fullNameInput = page.locator("#fullName");
    this.emailInput = page.locator("#email");
    this.passwordInput = page.locator("#password");
    this.organizationNameInput = page.locator("#organizationName");
    this.termsCheckbox = page.locator("#terms");
    this.submitButton = page.locator('button[type="submit"]');
    this.heading = page.getByRole("heading", { level: 2, name: /create your account|register|sign up/i });
    this.errorMessage = page.locator(".bg-red-50");
  }

  async goto(baseURL: string) {
    await this.page.goto(`${baseURL}/register`);
    await this.page.waitForLoadState("networkidle");
  }

  async register(data: {
    fullName: string;
    email: string;
    password: string;
    organizationName?: string;
  }) {
    await this.fullNameInput.fill(data.fullName);
    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);
    if (data.organizationName) {
      await this.organizationNameInput.fill(data.organizationName);
    }
    await this.termsCheckbox.check();
    await this.submitButton.click();
  }
}

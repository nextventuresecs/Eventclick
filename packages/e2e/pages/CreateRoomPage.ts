import { type Page, type Locator } from "@playwright/test";

export class CreateRoomPage {
  readonly page: Page;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly locationInput: Locator;
  readonly scheduledStartInput: Locator;
  readonly scheduledEndInput: Locator;
  readonly maxParticipantsInput: Locator;
  readonly attendanceWindowBeforeInput: Locator;
  readonly attendanceWindowAfterInput: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly heading: Locator;
  readonly addActivityButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleInput = page.locator("#title");
    this.descriptionInput = page.locator("#description");
    this.locationInput = page.locator("#location");
    this.scheduledStartInput = page.locator("#scheduledStart");
    this.scheduledEndInput = page.locator("#scheduledEnd");
    this.maxParticipantsInput = page.locator("#maxParticipants");
    this.attendanceWindowBeforeInput = page.locator("#attendanceWindowBefore");
    this.attendanceWindowAfterInput = page.locator("#attendanceWindowAfter");
    this.submitButton = page.getByRole("button", { name: /create room/i });
    this.cancelButton = page.getByRole("link", { name: /cancel/i });
    this.heading = page.getByRole("heading", { name: /create new room/i });
    this.addActivityButton = page.getByRole("button", { name: /add activity/i });
  }

  async goto(baseURL: string) {
    await this.page.goto(`${baseURL}/rooms/create`);
    await this.page.waitForLoadState("load");
  }

  async fillRoomDetails(data: {
    title: string;
    description?: string;
    location?: string;
    scheduledStart: string;
    scheduledEnd: string;
    maxParticipants?: string;
    attendanceWindowBefore?: string;
    attendanceWindowAfter?: string;
  }) {
    await this.titleInput.fill(data.title);
    if (data.description) {
      await this.descriptionInput.fill(data.description);
    }
    if (data.location) {
      await this.locationInput.fill(data.location);
    }
    await this.scheduledStartInput.fill(data.scheduledStart);
    await this.scheduledEndInput.fill(data.scheduledEnd);
    if (data.maxParticipants) {
      await this.maxParticipantsInput.fill(data.maxParticipants);
    }
    if (data.attendanceWindowBefore) {
      await this.attendanceWindowBeforeInput.fill(data.attendanceWindowBefore);
    }
    if (data.attendanceWindowAfter) {
      await this.attendanceWindowAfterInput.fill(data.attendanceWindowAfter);
    }
  }

  async addActivity(title: string, minPhotos: number = 1) {
    await this.addActivityButton.click();
    const activityTitleInput = this.page.locator("input[id^='act-title-']").first();
    const minPhotosInput = this.page.locator("input[id^='act-min-photos-']").first();
    await activityTitleInput.fill(title);
    await minPhotosInput.fill(String(minPhotos));
  }

  async submit() {
    await this.submitButton.click();
    await this.page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 15000 });
  }
}

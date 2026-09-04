import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SubmitContactRequestInput } from "@application/shared";

const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

vi.mock("../../config/env", () => ({
  env: {
    RESEND_API_KEY: "re_test",
    RESEND_FROM_EMAIL: "noreply@eventclick.live",
    CONTACT_NOTIFY_EMAIL: "demo@ustuealkai.resend.app",
    APP_URL: "https://app.eventclick.live",
  },
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const demoRequest: SubmitContactRequestInput = {
  kind: "demo",
  fullName: "Adhyant Patil",
  workEmail: "adhyant@example.org",
  orgName: "AgriClick Network LLP",
  teamSize: "10-50 field staff",
  useCase: "Field Attendance & Photo Verification",
};

describe("sendContactRequestEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({ error: null });
  });

  const load = async () => (await import("../email.service")).sendContactRequestEmail;

  it("delivers to the notify address, never to the submitter", async () => {
    await (await load())(demoRequest);

    const [payload] = send.mock.calls[0] ?? [];
    expect(payload.to).toBe("demo@ustuealkai.resend.app");
    // from: stays the verified sending domain — a public form must not be
    // able to choose our sending identity.
    expect(payload.from).toBe("noreply@eventclick.live");
    // The submitter is reachable by replying, without being the sender.
    expect(payload.replyTo).toBe("adhyant@example.org");
  });

  it("includes the submitted fields and omits absent ones", async () => {
    await (await load())(demoRequest);

    const [payload] = send.mock.calls[0] ?? [];
    expect(payload.subject).toBe("New demo request — AgriClick Network LLP");
    expect(payload.html).toContain("Adhyant Patil");
    expect(payload.html).toContain("10-50 field staff");
    // Support-only fields were not submitted, so their labels must not appear.
    expect(payload.html).not.toContain("Support type");
  });

  it("escapes attacker-controlled free text", async () => {
    await (await load())({
      ...demoRequest,
      fullName: '<script>alert("xss")</script>',
      orgName: "Acme & Co <b>",
    });

    const [payload] = send.mock.calls[0] ?? [];
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("&lt;script&gt;");
    expect(payload.html).toContain("Acme &amp; Co");
  });

  it("labels a support request differently", async () => {
    await (await load())({
      kind: "support",
      fullName: "Prathmesh",
      workEmail: "p@example.org",
      orgName: "AgriClick",
      supportType: "Demo",
      additionalContext: "Need help with attendance windows",
      consentGiven: true,
    });

    const [payload] = send.mock.calls[0] ?? [];
    expect(payload.subject).toBe("New support request — AgriClick");
    expect(payload.html).toContain("Need help with attendance windows");
    expect(payload.html).toContain("Marketing consent");
  });

  it("throws when Resend reports an error, so the caller can retry", async () => {
    send.mockResolvedValue({ error: { message: "rate limited" } });
    await expect((await load())(demoRequest)).rejects.toBeDefined();
  });
});

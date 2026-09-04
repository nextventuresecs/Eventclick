import { describe, it, expect, vi } from "vitest";

vi.mock("../../config/env", () => ({
  env: { APP_URL: "https://app.eventclick.live" },
}));

import { renderBrandedEmail } from "../email-template";

/**
 * These assert the constraints that make the markup survive a mail client,
 * not the visual design. Each one corresponds to a way branded email
 * routinely breaks in the wild.
 */
describe("renderBrandedEmail", () => {
  const basic = () => renderBrandedEmail({ heading: "Your event has started" });

  it("uses table layout, not flex or grid", () => {
    const html = basic();
    // Outlook renders through Word's HTML engine, which supports neither.
    expect(html).toContain("<table");
    expect(html).not.toMatch(/display\s*:\s*(flex|grid)/);
  });

  it("carries no CSS custom properties", () => {
    // var(--x) resolves nowhere in email, so the brand values have to be
    // literal hex. A var() here would render as an unstyled email.
    expect(basic()).not.toContain("var(--");
  });

  it("carries no <style> block, only inline styles", () => {
    // Gmail strips <style> on forwarded mail.
    const html = basic();
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).toContain('style="');
  });

  it("paints an explicit background wherever it shows one", () => {
    // An unpainted background is inverted by dark-mode clients, leaving dark
    // text on a dark ground.
    const html = basic();
    expect(html).toContain('bgcolor="#FFFFFF"');
    expect(html).toContain("background-color:#F5F3FC");
  });

  it("renders the heading and the brand wordmark", () => {
    const html = basic();
    expect(html).toContain("Your event has started");
    expect(html).toContain("Event");
    expect(html).toContain("#402291");
  });

  it("omits every optional block when not supplied", () => {
    const html = basic();
    expect(html).not.toContain("<a href=\"https://example.com\"");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("renders a call-to-action as a real link", () => {
    const html = renderBrandedEmail({
      heading: "Verify your email",
      cta: { label: "Verify email address", url: "https://app.eventclick.live/verify-email?token=abc" },
    });
    expect(html).toContain('href="https://app.eventclick.live/verify-email?token=abc"');
    expect(html).toContain("Verify email address");
  });

  it("inserts intro and body markup verbatim so callers can pass tags", () => {
    const html = renderBrandedEmail({
      heading: "Heads up",
      intro: "<strong>Field Day</strong> is now live.",
      bodyHtml: '<p style="margin:0;">Details below.</p>',
      footnote: "You are receiving this as a member.",
    });
    expect(html).toContain("<strong>Field Day</strong>");
    expect(html).toContain("Details below.");
    expect(html).toContain("You are receiving this as a member.");
  });

  it("links the footer to the configured app URL", () => {
    const html = basic();
    expect(html).toContain('href="https://app.eventclick.live"');
    // Displayed without the scheme.
    expect(html).toContain(">app.eventclick.live<");
  });
});

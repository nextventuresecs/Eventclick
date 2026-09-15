import { describe, it, expect } from "vitest";
import { senderAddressSchema } from "../emailSender";

/**
 * RESEND_FROM_EMAIL is our configuration, shared by every email. A malformed
 * value makes Resend reject each send with a 4xx validation error, which the
 * send path classifies as permanent (services/email-error.ts): every email
 * would be marked FAILED and lost. So a bad value must stop the process at
 * startup instead. docker-compose.prod.yml passes ${RESEND_FROM_EMAIL} with no
 * default, so a missing SSM parameter arrives as an empty string, which
 * zod's .default() does not replace.
 */
describe("senderAddressSchema", () => {
  it.for(["noreply@eventclick.live", "noreply@Eventclick.live", "Eventclick <noreply@eventclick.live>", "  noreply@eventclick.live  "])(
    "accepts %j",
    (value) => {
      expect(senderAddressSchema.safeParse(value).success).toBe(true);
    },
  );

  it.for(["", "   ", "noreply-eventclick.live", "noreply@", "@eventclick.live", "Eventclick <not an email>", "Eventclick noreply@eventclick.live", "a@b@c.live"])(
    "rejects %j",
    (value) => {
      expect(senderAddressSchema.safeParse(value).success).toBe(false);
    },
  );

  it("trims surrounding whitespace, which an .env line can carry", () => {
    expect(senderAddressSchema.parse("  noreply@eventclick.live  ")).toBe("noreply@eventclick.live");
  });
});

import { z } from "zod";

// `Name <address>` — the display-name form Resend accepts for `from`.
const DISPLAY_NAME_FORM = /^[^<>]*<([^<>]+)>$/;

/**
 * RESEND_FROM_EMAIL, checked at startup. Resend accepts `address` or
 * `Name <address>`.
 *
 * A malformed sender is our configuration, shared by every email, but Resend
 * reports it as a 4xx validation error, which the send path treats as
 * permanent (services/email-error.ts). Letting it through would mark every
 * email FAILED. Rejecting it here stops the process at boot instead, where a
 * deploy fails loudly and rolls back. An unverified domain still gets past
 * this check; Resend reports that as a 403, which retries.
 */
export const senderAddressSchema = z
  .string()
  .trim()
  .refine((value) => {
    const address = DISPLAY_NAME_FORM.exec(value)?.[1]?.trim() ?? value;
    return z.email().safeParse(address).success;
  }, "must be an email address, or `Name <email address>`");

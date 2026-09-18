import { ZodError } from "zod";

/**
 * Reading errors thrown by the email senders in email.service.ts.
 *
 * The senders rethrow Resend's `error` as it arrives, and that is a plain
 * object, `{ name, statusCode, message }`, not an Error. Anything else that
 * reaches here (a TypeError, a database error) is a real Error.
 */

type ProviderError = { name: string; statusCode: number | null; message: string };

const isProviderError = (err: unknown): err is ProviderError =>
  typeof err === "object" &&
  err !== null &&
  typeof (err as ProviderError).name === "string" &&
  typeof (err as ProviderError).message === "string" &&
  "statusCode" in err;

/**
 * Errors about this one email: its recipient or its content. Sending the same
 * request again gets the same answer, so retrying only delays the FAILED row.
 *
 * Deliberately absent, so they retry:
 * - invalid/missing/restricted API key, invalid_access, invalid_region:
 *   our configuration, shared by every email and fixed by a redeploy.
 *   Failing each email fast would lose all of them.
 * - invalid_from_address: in the SDK's type but not in Resend's current error
 *   reference. A malformed sender more likely arrives as a 400/422
 *   validation_error, which this list does treat as permanent, so
 *   RESEND_FROM_EMAIL is validated at startup instead (config/emailSender.ts).
 *   An unverified sending domain is a 403, which retries.
 * - rate_limit_exceeded, *_quota_exceeded, application_error (also what the
 *   SDK returns when the request never reached Resend), internal_server_error.
 */
const PERMANENT_NAMES = new Set(["validation_error", "missing_required_field", "invalid_parameter", "invalid_attachment"]);

/**
 * `validation_error` also covers an invalid API key (401) and an unverified
 * sending domain (403), which are configuration. Only a 400 or 422 is about
 * the request itself.
 */
const PERMANENT_STATUS = new Set([400, 422]);

export function isPermanentEmailError(err: unknown): boolean {
  if (err instanceof ZodError) return true;
  if (!isProviderError(err)) return false;
  return PERMANENT_NAMES.has(err.name) && err.statusCode !== null && PERMANENT_STATUS.has(err.statusCode);
}

/** A failure_reason worth reading, whatever was thrown. */
export function describeEmailError(err: unknown): string {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join(".") || "payload"}: ${i.message}`).join("; ");
    return `Invalid email payload (ZodError): ${issues}`;
  }
  if (isProviderError(err)) {
    const status = err.statusCode === null ? "" : ` ${err.statusCode}`;
    return `${err.name}${status}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

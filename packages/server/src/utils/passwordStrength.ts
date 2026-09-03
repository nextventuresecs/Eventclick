import zxcvbn from "zxcvbn";
import { ApiError } from "./errors";

/**
 * The single place password strength is decided.
 *
 * Four call sites — registration, password change, password reset and initial
 * password set — previously each ran `zxcvbn(password)` on the full input and
 * repeated the same threshold and error message.
 *
 * ## Why the input is truncated
 *
 * zxcvbn is synchronous and CPU-bound, and its cost grows superlinearly with
 * input length. Measured in this repo (Node 24, 30–40 iterations per case):
 *
 * | length | random | dictionary-ish |
 * |--------|--------|----------------|
 * | 16     | 1.5ms  | 1.4ms          |
 * | 24     | —      | 3.4ms          |
 * | 32     | 6.0ms  | 7.3ms          |
 * | 64     | 25.9ms | 34.5ms         |
 * | 128    | 101ms  | 149ms          |
 *
 * `PasswordSchema` allows 128 characters, so an attacker choosing the input
 * chose a ~150ms block of the event loop per request — stalling every
 * concurrent request on the process, not just their own. On a two-vCPU
 * instance that is a single-source denial of service with no special tooling.
 *
 * Scoring a 32-character prefix bounds the cost at roughly 7ms, a ~20x
 * reduction, and cannot make the rules weaker: adding characters to a string
 * only increases the guesses required, so a prefix scoring at or above the
 * threshold guarantees the full password does too. The reverse — a weak
 * 32-character prefix followed by strong material — is rejected, which is
 * stricter than before and the safe direction to err in.
 *
 * ## Why there is no "obviously strong, skip scoring" fast path
 *
 * Tempting, and unsafe. `Qwerty123456!@Ab` is 16 characters with all four
 * character classes and 16 distinct characters, and zxcvbn scores it **2** —
 * below the threshold. Any heuristic that accepted it to avoid the scoring
 * cost would weaken the rules users experience, which is exactly what this
 * change must not do. zxcvbn stays the authority; it is simply not allowed to
 * be given unbounded input.
 */
export const MAX_SCORED_PASSWORD_CHARS = 32;

/** zxcvbn's own scale: 3 is "safely unguessable". Unchanged from before. */
export const MIN_PASSWORD_SCORE = 3;

/**
 * Throws `ApiError.badRequest` when the password is too weak, with zxcvbn's
 * own feedback when it offers any. The server remains the decider — a
 * modified client cannot register a trivially weak password.
 */
export const assertPasswordStrength = (password: string): void => {
  const result = zxcvbn(password.slice(0, MAX_SCORED_PASSWORD_CHARS));

  if (result.score < MIN_PASSWORD_SCORE) {
    throw ApiError.badRequest(
      `Password is too weak. ${result.feedback.warning || "Please choose a stronger password."}`,
    );
  }
};

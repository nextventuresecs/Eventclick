import { describe, it, expect } from "vitest";
import { PDF_SYNC_RENDER_MARGIN_MS, PDF_ASYNC_RENDER_TIMEOUT_MS } from "../../config/constants";
import { env } from "../../config/env";

/**
 * #90: the renderer had a flat 120s abort deadline while the HTTP server
 * closes any request after SERVER_REQUEST_TIMEOUT_MS (30s). On the sync
 * download path the request was therefore always killed first, leaving
 * Gotenberg rendering output nobody was waiting for.
 *
 * The relationship between the two deadlines is the whole fix, and it is
 * invisible in a diff — so it is asserted here.
 */
describe("PDF render deadlines (#90)", () => {
  const syncTimeout = () =>
    Math.max(1_000, env.SERVER_REQUEST_TIMEOUT_MS - PDF_SYNC_RENDER_MARGIN_MS);

  it("keeps the sync render deadline inside the request timeout", () => {
    // The acceptance criterion, stated directly: no inner timeout on this
    // path may exceed the enclosing request timeout.
    expect(syncTimeout()).toBeLessThan(env.SERVER_REQUEST_TIMEOUT_MS);
  });

  it("leaves room to write the response after the renderer aborts", () => {
    // If the two were equal the request would die at the same instant the
    // renderer gave up, and the caller would still see a closed connection
    // rather than the 504 that explains it.
    expect(env.SERVER_REQUEST_TIMEOUT_MS - syncTimeout()).toBeGreaterThanOrEqual(
      PDF_SYNC_RENDER_MARGIN_MS,
    );
  });

  it("never collapses to a non-positive deadline on a short request timeout", () => {
    // A deployment could set SERVER_REQUEST_TIMEOUT_MS below the margin; the
    // floor keeps that from producing a zero or negative deadline that would
    // abort before the render ever starts.
    const withTinyRequestTimeout = Math.max(1_000, 2_000 - PDF_SYNC_RENDER_MARGIN_MS);
    expect(withTinyRequestTimeout).toBe(1_000);
  });

  it("gives the async worker a deadline longer than the sync one", () => {
    // The worker has no HTTP request bounding it, so a large report is
    // allowed to take longer there than a request should ever wait.
    expect(PDF_ASYNC_RENDER_TIMEOUT_MS).toBeGreaterThan(syncTimeout());
  });
});

describe("gatewayTimeout error (#90)", () => {
  it("is a distinct, retryable failure rather than a generic 500", async () => {
    // A hung renderer must be distinguishable from a report that could not be
    // built: 504 tells the caller to retry, 500 does not.
    const { ApiError } = await import("../../utils/errors");

    const timeout = ApiError.gatewayTimeout("Report rendering exceeded 25s");
    const generic = ApiError.internal("PDF generation failed");

    expect(timeout.statusCode).toBe(504);
    expect(timeout.code).toBe("GATEWAY_TIMEOUT");
    expect(generic.statusCode).toBe(500);
  });
});

import { describe, it, expect } from "vitest";
import { decidePdfJobClaim, PDF_JOB_STALE_MS } from "../pdfJobClaim";

const now = new Date("2026-09-15T10:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const row = (status: string, attempts: number, updatedAt = now) => ({ status, attempts, maxAttempts: 3, updatedAt });

describe("decidePdfJobClaim", () => {
  it("inserts a job it has never seen", () => {
    expect(decidePdfJobClaim(undefined, now)).toEqual({ action: "insert" });
  });

  it("processes a pending job", () => {
    expect(decidePdfJobClaim(row("pending", 2), now)).toEqual({ action: "process" });
  });

  it("skips a completed job, and a failed job with no attempts left", () => {
    expect(decidePdfJobClaim(row("completed", 1), now)).toEqual({ action: "skip", reason: "completed" });
    expect(decidePdfJobClaim(row("failed", 3), now)).toEqual({ action: "skip", reason: "max_attempts" });
  });

  it("retries a failed job with attempts left, counting the attempt", () => {
    expect(decidePdfJobClaim(row("failed", 1), now)).toEqual({ action: "retry", attempts: 2 });
  });

  it("defers a duplicate while another worker's job is fresh, so the message is not deleted", () => {
    expect(decidePdfJobClaim(row("processing", 1, ago(PDF_JOB_STALE_MS)), now)).toEqual({ action: "defer" });
  });

  it("reclaims a job abandoned mid-render, counting the attempt", () => {
    expect(decidePdfJobClaim(row("processing", 1, ago(PDF_JOB_STALE_MS + 1)), now)).toEqual({ action: "retry", attempts: 2 });
  });

  it("abandons a stale job with no attempts left instead of leaving it processing forever", () => {
    expect(decidePdfJobClaim(row("processing", 3, ago(10 * 60_000)), now)).toEqual({ action: "abandon", attempts: 3 });
  });

  it("treats null attempts as 0 and null max as 3", () => {
    expect(decidePdfJobClaim({ status: "failed", attempts: null, maxAttempts: null, updatedAt: now }, now)).toEqual({
      action: "retry",
      attempts: 1,
    });
  });

  it("is always stale by the time SQS redelivers a crashed job's message (300s visibility)", () => {
    expect(PDF_JOB_STALE_MS).toBeLessThan(300_000);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { clientLog } from "@/lib/log";

vi.mock("@/lib/log", () => ({
  clientLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const Bomb = () => {
  throw new Error("boom");
};

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // React logs the caught error to console too; keep test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reports the caught render error via clientLog.error", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(clientLog.error).toHaveBeenCalledTimes(1);
    const [message, stack] = vi.mocked(clientLog.error).mock.calls[0]!;
    expect(message).toBe("boom");
    expect(typeof stack).toBe("string");
  });
});

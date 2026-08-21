import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debounceByKey } from "../debounce";

describe("debounceByKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses N rapid calls for the same key into exactly one run", () => {
    const task = vi.fn();

    debounceByKey("room-1", task, 1000);
    debounceByKey("room-1", task, 1000);
    debounceByKey("room-1", task, 1000);
    debounceByKey("room-1", task, 1000);
    debounceByKey("room-1", task, 1000);

    vi.advanceTimersByTime(999);
    expect(task).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs the last-scheduled task's closure, not the first", () => {
    let observed: string | undefined;

    debounceByKey("room-1", () => {
      observed = "first";
    }, 1000);
    debounceByKey("room-1", () => {
      observed = "last";
    }, 1000);

    vi.advanceTimersByTime(1000);
    expect(observed).toBe("last");
  });

  it("different keys run independently — no cross-key coalescing", () => {
    const taskA = vi.fn();
    const taskB = vi.fn();

    debounceByKey("room-A", taskA, 1000);
    debounceByKey("room-B", taskB, 1000);

    vi.advanceTimersByTime(1000);
    expect(taskA).toHaveBeenCalledTimes(1);
    expect(taskB).toHaveBeenCalledTimes(1);
  });

  it("a new burst after the window fully elapses fires again", () => {
    const task = vi.fn();

    debounceByKey("room-1", task, 1000);
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(1);

    debounceByKey("room-1", task, 1000);
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("does not let a rejected task escape as an unhandled rejection", async () => {
    const task = vi.fn().mockRejectedValue(new Error("boom"));

    debounceByKey("room-1", task, 1000);
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(1);

    // Flush the microtask queue the rejected promise's internal .catch runs
    // on. If debounceByKey didn't catch it, this would surface as an
    // unhandled rejection and fail the test run.
    await Promise.resolve();
    await Promise.resolve();
  });
});

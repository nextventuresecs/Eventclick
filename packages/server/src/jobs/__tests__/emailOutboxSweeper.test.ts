import { describe, it, expect, vi, beforeEach } from "vitest";

const { sweep, redis } = vi.hoisted(() => ({
  sweep: vi.fn(),
  redis: { isOpen: true, set: vi.fn(), del: vi.fn() },
}));

vi.mock("../../services/email-delivery.service", () => ({ sweepPendingEmailDeliveries: sweep }));
vi.mock("../../config/redis", () => ({ redisClient: redis }));

import { pollEmailOutbox } from "../emailOutboxSweeper";

beforeEach(() => {
  sweep.mockReset();
  sweep.mockResolvedValue({ redelivered: 0, expired: 0, gaveUp: 0 });
  redis.isOpen = true;
  redis.set.mockReset();
  redis.set.mockResolvedValue("OK");
  redis.del.mockReset();
  redis.del.mockResolvedValue(1);
});

describe("pollEmailOutbox", () => {
  it("sweeps under the lock and releases it", async () => {
    await pollEmailOutbox();

    expect(redis.set).toHaveBeenCalledWith("jobs:email-outbox-sweeper:lock", "1", expect.objectContaining({ NX: true }));
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith("jobs:email-outbox-sweeper:lock");
  });

  it("leaves the sweep to the instance already holding the lock", async () => {
    redis.set.mockResolvedValue(null);

    await pollEmailOutbox();

    expect(sweep).not.toHaveBeenCalled();
  });

  // The lock only saves duplicate work; the sweep is safe to run twice. Email
  // recovery should not stop because Redis is down.
  it("still sweeps when Redis is unavailable", async () => {
    redis.isOpen = false;

    await pollEmailOutbox();

    expect(sweep).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("releases the lock and does not throw when the sweep fails", async () => {
    sweep.mockRejectedValue(new Error("database is down"));

    await expect(pollEmailOutbox()).resolves.toBeUndefined();
    expect(redis.del).toHaveBeenCalledWith("jobs:email-outbox-sweeper:lock");
  });
});

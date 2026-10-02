import { afterEach, describe, expect, it, vi } from "vitest";
import { SlidingWindowRateLimiter } from "../src/trello/rate-limit.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("Trello request rate limiter", () => {
  it("limits requests to 80 in every rolling 10-second window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const limiter = new SlidingWindowRateLimiter({
      now: () => Date.now(),
    });
    const acquiredAt: number[] = [];
    const requests = Array.from({ length: 81 }, async () => {
      await limiter.acquire();
      acquiredAt.push(Date.now());
    });

    await Promise.resolve();
    expect(acquiredAt).toHaveLength(80);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(acquiredAt).toHaveLength(80);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all(requests);

    expect(acquiredAt).toHaveLength(81);
    for (const start of new Set(acquiredAt)) {
      const requestsInWindow = acquiredAt.filter(
        (timestamp) => timestamp >= start && timestamp < start + 10_000,
      );
      expect(requestsInWindow.length).toBeLessThanOrEqual(80);
    }
  });

  it("does not allow simultaneous waiters to exceed the limit after a window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const limiter = new SlidingWindowRateLimiter({
      now: () => Date.now(),
    });
    const acquiredAt: number[] = [];
    const requests = Array.from({ length: 82 }, async () => {
      await limiter.acquire();
      acquiredAt.push(Date.now());
    });

    await Promise.resolve();
    expect(acquiredAt).toHaveLength(80);
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(requests);

    expect(acquiredAt).toHaveLength(82);
    expect(acquiredAt.filter((timestamp) => timestamp === 10_000)).toHaveLength(
      2,
    );
  });
});

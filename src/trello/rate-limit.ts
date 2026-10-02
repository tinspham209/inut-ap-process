export interface RequestRateLimiter {
  acquire(): Promise<void>;
}

export interface SlidingWindowRateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class SlidingWindowRateLimiter implements RequestRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly requestTimes: number[] = [];

  constructor(options: SlidingWindowRateLimiterOptions = {}) {
    this.maxRequests = options.maxRequests ?? 80;
    this.windowMs = options.windowMs ?? 10_000;
    this.now = options.now ?? (() => performance.now());
    this.sleep = options.sleep ?? defaultSleep;

    if (
      !Number.isSafeInteger(this.maxRequests) ||
      this.maxRequests < 1 ||
      !Number.isSafeInteger(this.windowMs) ||
      this.windowMs < 1
    ) {
      throw new Error("Rate limiter values must be positive integers");
    }
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = this.now();
      const windowStart = now - this.windowMs;
      while (
        this.requestTimes.length > 0 &&
        this.requestTimes[0]! <= windowStart
      ) {
        this.requestTimes.shift();
      }

      if (this.requestTimes.length < this.maxRequests) {
        this.requestTimes.push(now);
        return;
      }

      const oldestRequest = this.requestTimes[0];
      if (oldestRequest === undefined) {
        throw new Error("Rate limiter entered an invalid state");
      }
      await this.sleep(Math.max(1, oldestRequest + this.windowMs - now));
    }
  }
}

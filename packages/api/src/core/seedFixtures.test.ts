import { describe, it, expect, vi } from 'vitest';
import { seedFixturesWithRetry } from './seedFixtures';

const noopSleep = () => Promise.resolve();

describe('seedFixturesWithRetry', () => {
  it('retries until the seed succeeds and then stops', async () => {
    const seed = vi
      .fn()
      .mockRejectedValueOnce(new Error('Query timeout'))
      .mockRejectedValueOnce(new Error('Query timeout'))
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn(noopSleep);

    await seedFixturesWithRetry(seed, {
      maxAttempts: 5,
      baseDelayMs: 1,
      sleep,
    });

    expect(seed).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2); // backoff between the 3 attempts
  });

  it('throws after exhausting retries (definitive failure → caller crashes loudly)', async () => {
    const err = new Error('relation "Category" does not exist');
    const seed = vi.fn().mockRejectedValue(err);
    const sleep = vi.fn(noopSleep);

    await expect(
      seedFixturesWithRetry(seed, { maxAttempts: 3, baseDelayMs: 1, sleep })
    ).rejects.toThrow(err);

    expect(seed).toHaveBeenCalledTimes(3);
    // sleeps only between attempts, not after the final failure
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does NOT throw when the boot budget elapses, even while retries are failing', async () => {
    // Slowness must stay non-fatal — crashing here would re-create the
    // boot-timeout -> permanent-502 incident as a crash-loop.
    let calls = 0;
    const seed = vi.fn(() => {
      calls += 1;
      // Each attempt hangs; the boot budget (not retry exhaustion) ends it.
      return new Promise<void>(() => {});
    });

    await expect(
      seedFixturesWithRetry(seed, {
        maxAttempts: 3,
        baseDelayMs: 1,
        overallTimeoutMs: 20,
        sleep: vi.fn(noopSleep),
      })
    ).resolves.toBeUndefined();

    expect(calls).toBe(1); // first attempt still hanging when the budget hit
  });

  it('does not sleep when the first attempt succeeds', async () => {
    const seed = vi.fn().mockResolvedValueOnce(undefined);
    const sleep = vi.fn(noopSleep);

    await seedFixturesWithRetry(seed, {
      maxAttempts: 5,
      baseDelayMs: 1,
      sleep,
    });

    expect(seed).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('stops awaiting and returns when the overall boot budget elapses', async () => {
    // A hung seed must not block startup forever — the boot budget caps how
    // long seeding may delay binding the port. This is the regression guard
    // for the boot-timeout -> permanent-502 incident.
    const seed = vi.fn(() => new Promise<void>(() => {})); // never resolves
    const sleep = vi.fn(noopSleep);

    await expect(
      seedFixturesWithRetry(seed, {
        overallTimeoutMs: 20,
        baseDelayMs: 1,
        sleep,
      })
    ).resolves.toBeUndefined();

    expect(seed).toHaveBeenCalledTimes(1);
  });
});

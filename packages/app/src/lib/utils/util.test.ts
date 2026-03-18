import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Hoisted so it's available inside vi.mock() factory (which runs before imports)
const { mockHttp } = vi.hoisted(() => ({
  mockHttp: vi.fn((_url?: string, _config?: Record<string, unknown>) => {
    // Return a callable transport factory so createPublicClient doesn't blow up
    const factory = () => ({ request: vi.fn(), type: 'http' });
    factory.config = { key: 'http' };
    factory.value = {};
    return factory;
  }),
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    http: (...args: unknown[]) => mockHttp(...args),
    createPublicClient: vi.fn(() => ({ chain: { id: 1 } })),
  };
});

import {
  httpWithRetry,
  withRetry,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS,
} from './util';

// ---------------------------------------------------------------------------
// httpWithRetry
// ---------------------------------------------------------------------------
describe('httpWithRetry', () => {
  beforeEach(() => mockHttp.mockClear());

  it('passes default retry config to viem http()', () => {
    httpWithRetry('https://rpc.example.com');

    expect(mockHttp).toHaveBeenCalledWith('https://rpc.example.com', {
      retryCount: DEFAULT_RETRY_COUNT,
      retryDelay: DEFAULT_RETRY_DELAY_MS,
    });
  });

  it('works without a url', () => {
    httpWithRetry();

    expect(mockHttp).toHaveBeenCalledWith(undefined, {
      retryCount: DEFAULT_RETRY_COUNT,
      retryDelay: DEFAULT_RETRY_DELAY_MS,
    });
  });

  it('allows callers to override retry config', () => {
    httpWithRetry('https://rpc.example.com', {
      retryCount: 5,
      retryDelay: 500,
    });

    expect(mockHttp).toHaveBeenCalledWith('https://rpc.example.com', {
      retryCount: 5,
      retryDelay: 500,
    });
  });

  it('merges additional transport config', () => {
    httpWithRetry('https://rpc.example.com', { timeout: 30_000 });

    expect(mockHttp).toHaveBeenCalledWith('https://rpc.example.com', {
      retryCount: DEFAULT_RETRY_COUNT,
      retryDelay: DEFAULT_RETRY_DELAY_MS,
      timeout: 30_000,
    });
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------
describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns immediately when fn succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds after transient failures', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, 3, 100);

    // Advance through two retry delays (100ms, 200ms)
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting all retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('persistent'))
      .mockRejectedValueOnce(new Error('persistent'))
      .mockRejectedValueOnce(new Error('persistent'));

    const promise = withRetry(fn, 2, 100);
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const rejection = expect(promise).rejects.toThrow('persistent');

    // Advance through two retry delays (100ms, 200ms)
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await rejection;
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('uses exponential backoff delays', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockRejectedValueOnce(new Error('3'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, 3, 100);

    // After 99ms — only the first attempt should have fired
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);

    // At 100ms (100 * 2^0) — second attempt fires
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // At 300ms (100 + 200) — third attempt (100 * 2^1 = 200ms delay)
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    // At 700ms (300 + 400) — fourth attempt (100 * 2^2 = 400ms delay)
    await vi.advanceTimersByTimeAsync(400);
    expect(fn).toHaveBeenCalledTimes(4);

    await expect(promise).resolves.toBe('ok');
  });

  it('uses default parameters when none provided', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    await withRetry(fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

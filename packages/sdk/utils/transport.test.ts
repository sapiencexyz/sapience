import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockHttp } = vi.hoisted(() => ({
  mockHttp: vi.fn((_url?: string, _config?: Record<string, unknown>) => {
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
  };
});

import { httpWithRetry } from './transport';
import { DEFAULT_RETRY_COUNT, DEFAULT_RETRY_DELAY_MS } from './retry';

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

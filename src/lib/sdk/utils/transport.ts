import { http, type HttpTransportConfig } from 'viem';
import { DEFAULT_RETRY_COUNT, DEFAULT_RETRY_DELAY_MS } from './retry';

/**
 * Viem HTTP transport with default retry configuration.
 * Use this instead of bare `http()` so every RPC transport retries on transient failures.
 */
export function httpWithRetry(url?: string, config?: HttpTransportConfig) {
  return http(url, {
    retryCount: DEFAULT_RETRY_COUNT,
    retryDelay: DEFAULT_RETRY_DELAY_MS,
    ...config,
  });
}

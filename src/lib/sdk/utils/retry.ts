/** Default number of retries for transient RPC / async failures. */
export const DEFAULT_RETRY_COUNT = 3;
/** Default initial delay (ms) between retries. */
export const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Sleep for the given number of milliseconds.
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry an async operation with exponential backoff.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = DEFAULT_RETRY_COUNT,
  delayMs: number = DEFAULT_RETRY_DELAY_MS
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs * 2 ** attempt)
        );
      }
    }
  }
  throw lastError;
}

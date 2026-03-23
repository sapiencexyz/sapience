/**
 * HTTP fetch utilities with retry logic
 */

/**
 * Fetch with exponential backoff retry for 429/5xx errors and network failures
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries: number = 10,
  baseDelayMs: number = 1000
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on 429 rate limit
      if (
        (response.status === 429 || response.status === 402) &&
        attempt < maxRetries
      ) {
        const retryAfter = response.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 0;
        const delay =
          retryAfterMs > 0
            ? retryAfterMs
            : baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(
          `[Retry] HTTP 429 rate limited, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Retry on 5xx server errors
      if (
        response.status >= 500 &&
        response.status < 600 &&
        attempt < maxRetries
      ) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(
          `[Retry] HTTP ${response.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Retry on network errors
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(
          `[Retry] Network error: ${lastError.message}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

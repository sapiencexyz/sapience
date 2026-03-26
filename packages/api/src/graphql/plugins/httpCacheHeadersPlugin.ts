import type { ApolloServerPlugin } from '@apollo/server';
import type { ApolloContext } from '../startApolloServer';

/**
 * Apollo plugin that captures @cacheControl policy and stores it in
 * response extensions. The actual HTTP headers are set by Express
 * middleware (cdnCacheMiddleware) AFTER Apollo finishes — this avoids
 * responseCachePlugin overwriting our Cache-Control header with no-store.
 *
 * Cache strategy:
 * - `s-maxage` controls CDN edge cache TTL (uses full @cacheControl maxAge)
 * - `max-age` controls browser cache TTL (capped at 10s — TanStack React Query
 *   manages client-side freshness, so we avoid stale browser cache on refetch)
 * - `Surrogate-Key` enables targeted cache purging by operation name
 * - Skips mutations, subscriptions, and error responses
 */
export function httpCacheHeadersPlugin(): ApolloServerPlugin<ApolloContext> {
  return {
    async requestDidStart() {
      return {
        async willSendResponse({ response, overallCachePolicy, operation }) {
          // Only cache queries
          if (operation?.operation !== 'query') return;

          // Don't cache error responses
          const body = response.body;
          if (
            body.kind !== 'single' ||
            (body.singleResult.errors && body.singleResult.errors.length > 0)
          )
            return;

          const maxAge = overallCachePolicy?.maxAge;
          if (maxAge == null || maxAge <= 0) return;

          const headers = response.http?.headers;
          if (!headers) return;

          // Store cache metadata in custom headers that won't be
          // overwritten by responseCachePlugin. The Express middleware
          // reads these and sets the real Cache-Control header.
          headers.set('X-Cache-MaxAge', String(maxAge));

          const opName = operation?.name?.value;
          if (opName) {
            headers.set('X-Cache-Operation', opName);
          }
        },
      };
    },
  };
}

/**
 * Express middleware that reads cache metadata set by httpCacheHeadersPlugin
 * and overwrites the Cache-Control header AFTER Apollo (including
 * responseCachePlugin) has finished writing the response.
 */
export function cdnCacheMiddleware(
  _req: unknown,
  res: {
    getHeader(name: string): string | number | string[] | undefined;
    setHeader(name: string, value: string): void;
    removeHeader(name: string): void;
    on(event: string, listener: () => void): void;
  },
  next: () => void
) {
  res.on('finish', () => {
    // Headers are already sent at this point — too late.
    // We need to intercept before send.
  });

  // Override writeHead to set headers just before they're sent
  const origWriteHead = (
    res as unknown as {
      writeHead: (...args: unknown[]) => unknown;
    }
  ).writeHead;

  (
    res as unknown as {
      writeHead: (...args: unknown[]) => unknown;
    }
  ).writeHead = function (...args: unknown[]) {
    const maxAge = res.getHeader('x-cache-maxage');
    if (maxAge) {
      const browserMaxAge = Math.min(Number(maxAge), 10);
      res.setHeader(
        'Cache-Control',
        `public, s-maxage=${maxAge}, max-age=${browserMaxAge}`
      );
      res.removeHeader('x-cache-maxage');

      const opName = res.getHeader('x-cache-operation');
      if (opName) {
        res.setHeader('Surrogate-Key', String(opName));
        res.removeHeader('x-cache-operation');
      }
    }

    return origWriteHead.apply(this, args);
  };

  next();
}

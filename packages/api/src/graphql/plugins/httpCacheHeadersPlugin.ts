import type { ApolloServerPlugin } from '@apollo/server';
import type { ApolloContext } from '../startApolloServer';

/**
 * Apollo plugin that translates @cacheControl hints into HTTP headers
 * so upstream CDNs (Cloudflare, Fastly, etc.) can cache responses.
 *
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

          // CDN TTL = full maxAge, browser TTL = capped at 10s
          const browserMaxAge = Math.min(maxAge, 10);
          headers.set(
            'Cache-Control',
            `public, s-maxage=${maxAge}, max-age=${browserMaxAge}`
          );

          // Operation name as surrogate key for targeted purge
          const opName = operation?.name?.value;
          if (opName) {
            headers.set('Surrogate-Key', opName);
          }
        },
      };
    },
  };
}

/**
 * Cache pure introspection responses for a long max-age.
 *
 * Playground refreshes, codegen runs (`graphql-codegen --watch`), and
 * IDE plugins (Apollo VS Code, Relay LSP) hammer `__schema` and
 * `__type` on every reload. The schema is immutable for the life of a
 * deploy, so these responses can be served from the CDN for a full day
 * without staleness risk.
 *
 * We piggyback on the existing httpCacheHeadersPlugin → cdnCacheMiddleware
 * pipeline by writing the same `X-Cache-MaxAge` header that the
 * `@cacheControl`-driven path uses. That way both code paths set
 * `Cache-Control: s-maxage=...` consistently downstream.
 *
 * Pure-introspection detection mirrors the gate already used in
 * `didResolveOperation` for skipping complexity / list-size checks: a
 * query is "pure introspection" if every top-level selection is
 * `__schema` or `__type`.
 */

import type { ApolloServerPlugin } from '@apollo/server';
import type { ApolloContext } from '../startApolloServer';

const INTROSPECTION_MAX_AGE = 24 * 60 * 60; // 24h in seconds

export function introspectionCachePlugin(): ApolloServerPlugin<ApolloContext> {
  return {
    async requestDidStart() {
      return {
        async willSendResponse({ response, operation, document }) {
          if (operation?.operation !== 'query') return;
          if (!document) return;

          const isPureIntrospection = document.definitions.every(
            (def) =>
              def.kind !== 'OperationDefinition' ||
              def.selectionSet.selections.every(
                (sel) =>
                  sel.kind === 'Field' &&
                  (sel.name.value === '__schema' || sel.name.value === '__type')
              )
          );
          if (!isPureIntrospection) return;

          const body = response.body;
          if (
            body.kind !== 'single' ||
            (body.singleResult.errors && body.singleResult.errors.length > 0)
          )
            return;

          const headers = response.http?.headers;
          if (!headers) return;

          // Only set if a stricter hint isn't already in place — the
          // resolver-level @cacheControl path always wins.
          if (headers.get('X-Cache-MaxAge')) return;

          headers.set('X-Cache-MaxAge', String(INTROSPECTION_MAX_AGE));
          headers.set('X-Cache-Operation', 'introspection');
        },
      };
    },
  };
}

import type { Request } from 'express';
import prisma from '../core/db';
import type { GraphQLLoaders } from './sdl/resolvers/loaders';
import { SharedSchema } from './sharedSchema';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import { httpCacheHeadersPlugin } from './plugins/httpCacheHeadersPlugin';
import { operationTimingPlugin } from './plugins/operationTimingPlugin';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';
import { validateQuery } from './queryValidation.js';
import {
  getComplexity,
  createComplexityEstimators,
} from './queryComplexity.js';
import { config } from '../core/config';
import { createLogger } from '../core/logger';
import { buildApiSchema } from './buildSchema';

const log = createLogger('graphql');

export interface ApolloContext {
  prisma: typeof prisma;
  // Populated by core/server.ts when wiring expressMiddleware so the
  // operation log can pick up the reqId pino-http attaches to each request.
  // pino-http augments IncomingMessage with `id: ReqId` (string | number | object).
  req?: Request;
  // Set by the inline complexity plugin in didResolveOperation; read by
  // operationTimingPlugin in willSendResponse. Optional because the
  // complexity plugin skips pure-introspection queries.
  queryComplexity?: number;
  /**
   * Optional per-request cache: conditionId → Prisma Condition row.
   *
   * Hot resolvers (positions, accountActivity) batch-load every
   * referenced Condition up front and populate this map; the
   * Pick.condition field resolver then returns rows from the cache
   * without a per-pick round trip. Resolvers that don't pre-populate
   * fall back to per-pick lookups.
   *
   * Stored on context (not as a request-scoped DataLoader) because we
   * already do the batching ourselves before mapPickConfig and just
   * need a place to stash the map for the field resolver to read.
   */
  pickConditions?: Map<string, unknown>;
  /**
   * Per-request DataLoaders. See `sdl/resolvers/loaders.ts` for the
   * full set; today this dedupes pickConfiguration-by-id lookups so
   * resolvers that reference the same id from different paths in one
   * query share a single round trip.
   */
  loaders?: GraphQLLoaders;
}

export const initializeApolloServer = async () => {
  const schema = await buildApiSchema({ emitSchemaFile: true });

  // Default of 15000 covers legitimate app queries (positions(take:50) with
  // inline Pick.condition tops ~11000) while still blocking deeply nested
  // queries like conditions(take: 200) with 5 levels of nesting (~55000).
  const maxComplexity = config.GRAPHQL_MAX_COMPLEXITY;

  log.info({ maxComplexity }, 'GraphQL query complexity limit set');

  // Create Apollo Server with the combined schema, depth limit, and query complexity limit
  const apolloServer = new ApolloServer({
    schema,
    // Allow GET requests for GraphQL queries — enables CDN edge caching.
    // Safe to disable: the API is stateless with no cookie/session auth
    // (wallet signatures via x-admin-signature header), so CSRF does not apply.
    // All data is public, CORS is strict, and error responses are excluded from caching.
    csrfPrevention: false,
    formatError: (formattedError, error) => {
      // Apollo auto-attaches `code: 'INTERNAL_SERVER_ERROR'` to formattedError
      // whenever a resolver throws a non-GraphQLError, so the presence of a
      // code is NOT a reliable client/internal signal. The reliable signal is
      // whether the error was thrown as a GraphQLError on purpose: a direct
      // `throw new GraphQLError(...)` has `originalError === undefined`,
      // whereas a wrapped non-GraphQLError exposes the underlying cause via
      // `originalError`. Internal exceptions go to log.error (→ Sentry);
      // intentional client-facing errors go to log.warn (stdout-only).
      const isClientError =
        error instanceof GraphQLError && error.originalError === undefined;
      if (isClientError) {
        log.warn(
          { err: error, code: formattedError.extensions?.code },
          'GraphQL client error'
        );
      } else {
        log.error({ err: error }, 'GraphQL internal error');
      }
      if (!config.isDev) {
        delete formattedError.extensions?.stacktrace;
      }
      return formattedError;
    },
    introspection: true,
    // accountActivity → prediction → pickConfig → picks → condition →
    // category → slug naturally needs depth 6. Limit kept tight enough to
    // still block fan-out like conditions(take: 200) with 5+ relations.
    validationRules: [depthLimit(6)],
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
      httpCacheHeadersPlugin(),
      operationTimingPlugin(),
      responseCachePlugin(),
      // Query complexity plugin
      // Note: Uses local adaptation of graphql-query-complexity to avoid
      // the "dual package hazard" in ESM + pnpm environments.
      // See: packages/api/src/graphql/queryComplexity.ts for details.
      {
        async requestDidStart() {
          return {
            async didResolveOperation({ request, document, contextValue }) {
              // Skip validation for pure introspection queries
              // (queries that ONLY contain __schema or __type fields)
              // Introspection is already gated by the introspection: true setting
              // and doesn't touch the database
              const isPureIntrospectionQuery = document.definitions.every(
                (def) =>
                  def.kind !== 'OperationDefinition' ||
                  def.selectionSet.selections.every(
                    (sel) =>
                      sel.kind === 'Field' &&
                      (sel.name.value === '__schema' ||
                        sel.name.value === '__type')
                  )
              );
              if (isPureIntrospectionQuery) {
                return;
              }

              // Validate pagination arguments and field alias limits
              validateQuery(document, {
                maxListSize: config.GRAPHQL_MAX_LIST_SIZE,
                maxFieldAliases: config.GRAPHQL_MAX_FIELD_ALIASES,
                variables: request.variables ?? {},
              });

              const complexity = getComplexity({
                schema,
                query: document,
                variables: request.variables ?? {},
                estimators: createComplexityEstimators(
                  config.GRAPHQL_MAX_LIST_SIZE
                ),
              });

              // Bridge to operationTimingPlugin's willSendResponse logger.
              contextValue.queryComplexity = complexity;

              log.debug({ complexity }, 'Query complexity computed');

              if (complexity > maxComplexity) {
                const errorMessage = `Query complexity limit exceeded. Maximum allowed: ${maxComplexity}, Actual: ${complexity}`;
                const exceededBy = complexity - maxComplexity;
                // Sentry only for genuinely abusive queries (>50% over).
                // Bounded queries that just nudge the limit stay stdout-only.
                const exceededThreshold = maxComplexity * 1.5;
                if (complexity > exceededThreshold) {
                  log.error(
                    {
                      err: new Error(errorMessage),
                      sentryLevel: 'warning',
                      tags: {
                        type: 'query_complexity_exceeded',
                        graphql: 'validation',
                      },
                      maxComplexity,
                      actualComplexity: complexity,
                      exceededBy,
                      exceededByPercent: Math.round(
                        (exceededBy / maxComplexity) * 100
                      ),
                    },
                    'Complexity limit exceeded (Sentry-reported)'
                  );
                } else {
                  log.warn(
                    {
                      maxComplexity,
                      actualComplexity: complexity,
                      exceededBy,
                    },
                    'Complexity limit exceeded'
                  );
                }

                throw new GraphQLError(errorMessage, {
                  extensions: {
                    code: 'QUERY_COMPLEXITY_EXCEEDED',
                    http: { status: 400 },
                  },
                });
              }
            },
          };
        },
      },
    ],
  });

  await apolloServer.start();

  // Get the singleton instance
  const sharedSchema = SharedSchema.getInstance();

  // Set the combined schema (with both generated and custom resolvers)
  sharedSchema.setSchema(schema);

  return apolloServer;
};

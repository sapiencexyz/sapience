/**
 * Initialize the Apollo Server backing `/v2/graphql`.
 *
 * Mirrors `../startApolloServer.ts` (v1) but uses the v2 schema, tags the
 * operation log with `endpoint: "v2"` so dashboards can split the two,
 * and keeps the same hardening surface (depth limit, query complexity,
 * list-size / alias caps, response cache, op timing).
 */

import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';
import { httpCacheHeadersPlugin } from '../plugins/httpCacheHeadersPlugin';
import { introspectionCachePlugin } from '../plugins/introspectionCachePlugin';
import { operationTimingPlugin } from '../plugins/operationTimingPlugin';
import { validateQuery } from '../queryValidation.js';
import {
  getComplexity,
  createComplexityEstimators,
} from '../queryComplexity.js';
import { config } from '../../core/config';
import { createLogger } from '../../core/logger';
import { buildV2Schema } from './buildSchema';
import type { ApolloContext } from '../startApolloServer';

const log = createLogger('graphql.v2');

export const initializeApolloServerV2 = async () => {
  const schema = await buildV2Schema({ emitSchemaFile: true });

  const maxComplexity = config.GRAPHQL_V2_MAX_COMPLEXITY;
  const maxDepth = config.GRAPHQL_V2_MAX_DEPTH;
  const apqTtlMs = config.GRAPHQL_V2_APQ_TTL_MS;

  log.info(
    { maxComplexity, maxDepth, apqTtlMs },
    'v2 GraphQL query limits set'
  );

  const apolloServer = new ApolloServer<ApolloContext>({
    schema,
    // Bounded LRU; backs both response cache (responseCachePlugin) and
    // the APQ store below. Without this Apollo logs a startup warning
    // about an unbounded default.
    cache: 'bounded',
    // Automatic Persisted Queries — clients can submit a SHA-256 hash
    // of the operation; on cache hit we skip parsing+validation
    // entirely and go straight to plan+execute. On miss the client
    // resends the full query and we cache it for next time.
    //
    // TODO(v2): for the bigger "strict persisted queries" win in the
    // perf notes (rejecting ad-hoc queries from untrusted clients and
    // foreclosing the DoS surface), wire a build-time manifest from
    // the SDK codegen step and gate the request handler on
    // hash ∈ manifest. APQ is the same wire protocol minus the gate,
    // so the migration is additive.
    persistedQueries: { ttl: Math.floor(apqTtlMs / 1000) },
    csrfPrevention: false,
    formatError: (formattedError, error) => {
      const isClientError =
        error instanceof GraphQLError && error.originalError === undefined;
      if (isClientError) {
        log.warn(
          { err: error, code: formattedError.extensions?.code },
          'GraphQL v2 client error'
        );
      } else {
        log.error({ err: error }, 'GraphQL v2 internal error');
      }
      if (!config.isDev) {
        delete formattedError.extensions?.stacktrace;
      }
      return formattedError;
    },
    introspection: true,
    validationRules: [depthLimit(maxDepth)],
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
      httpCacheHeadersPlugin(),
      introspectionCachePlugin(),
      // TODO(v2): extend operationTimingPlugin to tag logs with endpoint
      // so dashboards can split /graphql from /v2/graphql traffic.
      operationTimingPlugin(),
      responseCachePlugin(),
      {
        async requestDidStart() {
          return {
            async didResolveOperation({ request, document, contextValue }) {
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
              if (isPureIntrospectionQuery) return;

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

              contextValue.queryComplexity = complexity;
              log.debug({ complexity }, 'v2 query complexity computed');

              if (complexity > maxComplexity) {
                const errorMessage = `Query complexity limit exceeded. Maximum allowed: ${maxComplexity}, Actual: ${complexity}`;
                log.warn(
                  { maxComplexity, actualComplexity: complexity },
                  'v2 complexity limit exceeded'
                );
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
  return apolloServer;
};

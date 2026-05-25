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

  const maxComplexity = config.GRAPHQL_MAX_COMPLEXITY;

  log.info({ maxComplexity }, 'v2 GraphQL query complexity limit set');

  const apolloServer = new ApolloServer<ApolloContext>({
    schema,
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
    validationRules: [depthLimit(7)],
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
      httpCacheHeadersPlugin(),
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

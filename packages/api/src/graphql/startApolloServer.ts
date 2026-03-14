import 'reflect-metadata';
import { buildSchema, type NonEmptyArray } from 'type-graphql';
import { relationResolvers } from '@generated/type-graphql';
import { prisma } from './resolvers/GeneratedResolvers';
import { SharedSchema } from './sharedSchema';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';
import { validateQuery } from './queryValidation.js';
import {
  getComplexity,
  createComplexityEstimators,
} from './queryComplexity.js';
import { config } from '../config';
import Sentry from '../instrument';

// Import only the actively-used query resolvers from generated TypeGraphQL
// See graphql-audit._ljm_.md for the full audit of which resolvers are used by consumers
import {
  FindManyAttestationResolver,
  FindManyCategoryResolver,
  FindUniqueConditionResolver,
  FindManyConditionGroupResolver,
  FindUniqueConditionGroupResolver,
  FindManyUserResolver,
  FindUniqueUserResolver,
} from '@generated/type-graphql';

// Import the custom resolvers to keep
import {
  PnLResolver,
  ScoreResolver,
  EscrowResolver,
  AnalyticsResolver,
  ConditionResolver,
  VolumeResolver,
  QuestionsResolver,
  TradeResolver,
  TimeSeriesResolver,
  CollateralBalanceResolver,
} from './resolvers';

export interface ApolloContext {
  prisma: typeof prisma;
}

export const initializeApolloServer = async () => {
  // Generated query resolvers — only those with verified consumer usage
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const queryResolvers: Function[] = [
    FindManyAttestationResolver,
    FindManyCategoryResolver,
    FindUniqueConditionResolver,
    FindManyConditionGroupResolver,
    FindUniqueConditionGroupResolver,
    FindManyUserResolver,
    FindUniqueUserResolver,
  ];

  // Build the GraphQL schema with query resolvers, relation resolvers, and custom resolvers
  const allResolvers = queryResolvers
    .concat(relationResolvers)
    .concat([
      PnLResolver,
      ScoreResolver,
      EscrowResolver,
      AnalyticsResolver,
      ConditionResolver,
      VolumeResolver,
      QuestionsResolver,
      TradeResolver,
      TimeSeriesResolver,
      CollateralBalanceResolver,
    ]);
  const schema = await buildSchema({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- type-graphql's buildSchema API requires NonEmptyArray<Function>
    resolvers: allResolvers as NonEmptyArray<Function>,
    validate: false,
    emitSchemaFile: true,
  });

  // Default of 10000 allows all legitimate app queries (max ~8700) while blocking
  // deeply nested queries like conditions(take: 200) with 5 levels of nesting (~55000)
  const maxComplexity = config.GRAPHQL_MAX_COMPLEXITY;

  console.log(`GraphQL query complexity limit set to: ${maxComplexity}`);

  // Create Apollo Server with the combined schema, depth limit, and query complexity limit
  const apolloServer = new ApolloServer({
    schema,
    formatError: (formattedError, error) => {
      console.error('GraphQL Error:', error);
      if (!config.isDev) {
        delete formattedError.extensions?.stacktrace;
      }
      return formattedError;
    },
    introspection: true,
    validationRules: [depthLimit(5)],
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
      responseCachePlugin(),
      // Query complexity plugin
      // Note: Uses local adaptation of graphql-query-complexity to avoid
      // the "dual package hazard" in ESM + pnpm environments.
      // See: packages/api/src/graphql/queryComplexity.ts for details.
      {
        async requestDidStart() {
          return {
            async didResolveOperation({ request, document }) {
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

              if (config.isDev) {
                console.log(`Query complexity: ${complexity}`);
              }

              if (complexity > maxComplexity) {
                const errorMessage = `Query complexity limit exceeded. Maximum allowed: ${maxComplexity}, Actual: ${complexity}`;
                const exceededBy = complexity - maxComplexity;

                console.error(
                  `Complexity limit exceeded! Max: ${maxComplexity}, Actual: ${complexity} (exceeded by ${exceededBy})`
                );

                // Only report to Sentry if complexity is significantly exceeded (>50% over limit)
                const exceededThreshold = maxComplexity * 1.5;
                if (complexity > exceededThreshold) {
                  Sentry.captureException(new Error(errorMessage), {
                    level: 'warning',
                    tags: {
                      type: 'query_complexity_exceeded',
                      graphql: 'validation',
                    },
                    extra: {
                      maxComplexity,
                      actualComplexity: complexity,
                      exceededBy,
                      exceededByPercent: Math.round(
                        (exceededBy / maxComplexity) * 100
                      ),
                    },
                  });
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

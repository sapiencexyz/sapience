import 'reflect-metadata';
import { buildSchema } from 'type-graphql';
import { relationResolvers } from '@generated/type-graphql';
import { prisma } from './resolvers/GeneratedResolvers';
import { SharedSchema } from './sharedSchema';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';
import {
  getComplexity,
  simpleEstimator,
  fieldExtensionsEstimator,
  listMultiplierEstimator,
  fieldCostEstimator,
} from './queryComplexity.js';
import { config } from '../config';
import Sentry from '../instrument';

// Import only the actively-used query resolvers from generated TypeGraphQL
// See graphql-audit._ljm_.md for the full audit of which resolvers are used by consumers
import {
  // Attestation: only FindMany (used by app)
  FindManyAttestationResolver,

  // Category: only FindMany (used by app)
  FindManyCategoryResolver,

  // Condition: only FindUnique (used by sdk, parlay-bot)
  // FindMany and FindFirst are replaced by custom ConditionResolver
  FindUniqueConditionResolver,

  // ConditionGroup: FindUnique (used by parlay-bot) + FindMany (used by app)
  FindManyConditionGroupResolver,
  FindUniqueConditionGroupResolver,

  // User: FindUnique (used by app) + FindMany (deprecated, kept for admin use)
  FindManyUserResolver,
  FindUniqueUserResolver,
} from '@generated/type-graphql';

// Import the custom resolvers to keep
import {
  PnLResolver,
  ScoreResolver,
  PositionResolver,
  AnalyticsResolver,
  ConditionResolver,
  VolumeResolver,
  QuestionsResolver,
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
      PositionResolver,
      AnalyticsResolver,
      ConditionResolver,
      VolumeResolver,
      QuestionsResolver,
    ]);
  const schema = await buildSchema({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvers: allResolvers as any,
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
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return error;
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
              // Skip complexity checking for pure introspection queries
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

              const complexity = getComplexity({
                schema,
                query: document,
                variables: request.variables ?? {},
                estimators: [
                  fieldExtensionsEstimator(),
                  // Assign high costs to expensive aggregate operations (used in groupBy queries)
                  // This allows simple groupBy queries but blocks full-table aggregations
                  fieldCostEstimator((fieldName) => {
                    // Block aggregate fields that require full table scans
                    if (fieldName === '_all') return 10000;
                    if (fieldName.startsWith('_count')) return 5000;
                    if (fieldName.startsWith('_sum')) return 5000;
                    if (fieldName.startsWith('_avg')) return 5000;
                    if (fieldName.startsWith('_min')) return 5000;
                    if (fieldName.startsWith('_max')) return 5000;
                    // Introspection fields - cost for mixed queries
                    // (pure introspection queries are skipped above)
                    if (fieldName === '__schema') return 100;
                    if (fieldName === '__type') return 50;
                    return undefined;
                  }),
                  // Multiply complexity by list size (take/first/limit args) to capture N+1 cost
                  // maxListSize capped at 100 to prevent abuse via large pagination values
                  listMultiplierEstimator({
                    defaultListSize: 10,
                    maxListSize: 100,
                  }),
                  simpleEstimator({ defaultComplexity: 1 }),
                ],
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
                  extensions: { code: 'QUERY_COMPLEXITY_EXCEEDED' },
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

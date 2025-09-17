import 'reflect-metadata';
import { buildSchema } from 'type-graphql';
import { relationResolvers } from '@generated/type-graphql';
import { prisma } from './resolvers/GeneratedResolvers';
import { SharedSchema } from './sharedSchema';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import depthLimit from 'graphql-depth-limit';

// Import only the query (read-only) resolvers from generated TypeGraphQL
import {
  // Category queries
  AggregateCategoryResolver,
  FindFirstCategoryResolver,
  FindFirstCategoryOrThrowResolver,
  FindManyCategoryResolver,
  FindUniqueCategoryResolver,
  FindUniqueCategoryOrThrowResolver,
  GroupByCategoryResolver,

  // Market queries
  AggregateMarketResolver,
  FindFirstMarketResolver,
  FindFirstMarketOrThrowResolver,
  FindManyMarketResolver,
  FindUniqueMarketResolver,
  FindUniqueMarketOrThrowResolver,
  GroupByMarketResolver,

  // MarketGroup queries
  AggregateMarketGroupResolver,
  FindFirstMarketGroupResolver,
  FindFirstMarketGroupOrThrowResolver,
  FindManyMarketGroupResolver,
  FindUniqueMarketGroupResolver,
  FindUniqueMarketGroupOrThrowResolver,
  GroupByMarketGroupResolver,

  // MarketPrice queries
  AggregateMarketPriceResolver,
  FindFirstMarketPriceResolver,
  FindFirstMarketPriceOrThrowResolver,
  FindManyMarketPriceResolver,
  FindUniqueMarketPriceResolver,
  FindUniqueMarketPriceOrThrowResolver,
  GroupByMarketPriceResolver,

  // Position queries
  AggregatePositionResolver,
  FindFirstPositionResolver,
  FindFirstPositionOrThrowResolver,
  FindManyPositionResolver,
  FindUniquePositionResolver,
  FindUniquePositionOrThrowResolver,
  GroupByPositionResolver,

  // Resource queries
  AggregateResourceResolver,
  FindFirstResourceResolver,
  FindFirstResourceOrThrowResolver,
  FindManyResourceResolver,
  FindUniqueResourceResolver,
  FindUniqueResourceOrThrowResolver,
  GroupByResourceResolver,

  // ResourcePrice queries
  AggregateResourcePriceResolver,
  FindFirstResourcePriceResolver,
  FindFirstResourcePriceOrThrowResolver,
  FindManyResourcePriceResolver,
  FindUniqueResourcePriceResolver,
  FindUniqueResourcePriceOrThrowResolver,
  GroupByResourcePriceResolver,

  // Transaction queries
  AggregateTransactionResolver,
  FindFirstTransactionResolver,
  FindFirstTransactionOrThrowResolver,
  FindManyTransactionResolver,
  FindUniqueTransactionResolver,
  FindUniqueTransactionOrThrowResolver,
  GroupByTransactionResolver,

  // Attestation queries
  AggregateAttestationResolver,
  FindFirstAttestationResolver,
  FindFirstAttestationOrThrowResolver,
  FindManyAttestationResolver,
  FindUniqueAttestationResolver,
  FindUniqueAttestationOrThrowResolver,
  GroupByAttestationResolver,
  // Condition queries
  AggregateConditionResolver,
  FindFirstConditionResolver,
  FindFirstConditionOrThrowResolver,
  FindManyConditionResolver,
  FindUniqueConditionResolver,
  FindUniqueConditionOrThrowResolver,
  GroupByConditionResolver,
} from '@generated/type-graphql';

// Import the custom resolvers to keep
import {
  CandleResolver,
  PnLResolver,
  VolumeResolver,
  ScoreResolver,
} from './resolvers';

export interface ApolloContext {
  prisma: typeof prisma;
}

export const initializeApolloServer = async () => {
  // Define the query-only resolvers
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const queryResolvers: Function[] = [
    // Category queries
    AggregateCategoryResolver,
    FindFirstCategoryResolver,
    FindFirstCategoryOrThrowResolver,
    FindManyCategoryResolver,
    FindUniqueCategoryResolver,
    FindUniqueCategoryOrThrowResolver,
    GroupByCategoryResolver,

    // (removed) CryptoPrices queries

    // Market queries
    AggregateMarketResolver,
    FindFirstMarketResolver,
    FindFirstMarketOrThrowResolver,
    FindManyMarketResolver,
    FindUniqueMarketResolver,
    FindUniqueMarketOrThrowResolver,
    GroupByMarketResolver,

    // MarketGroup queries
    AggregateMarketGroupResolver,
    FindFirstMarketGroupResolver,
    FindFirstMarketGroupOrThrowResolver,
    FindManyMarketGroupResolver,
    FindUniqueMarketGroupResolver,
    FindUniqueMarketGroupOrThrowResolver,
    GroupByMarketGroupResolver,

    // MarketPrice queries
    AggregateMarketPriceResolver,
    FindFirstMarketPriceResolver,
    FindFirstMarketPriceOrThrowResolver,
    FindManyMarketPriceResolver,
    FindUniqueMarketPriceResolver,
    FindUniqueMarketPriceOrThrowResolver,
    GroupByMarketPriceResolver,

    // Position queries
    AggregatePositionResolver,
    FindFirstPositionResolver,
    FindFirstPositionOrThrowResolver,
    FindManyPositionResolver,
    FindUniquePositionResolver,
    FindUniquePositionOrThrowResolver,
    GroupByPositionResolver,

    // Resource queries
    AggregateResourceResolver,
    FindFirstResourceResolver,
    FindFirstResourceOrThrowResolver,
    FindManyResourceResolver,
    FindUniqueResourceResolver,
    FindUniqueResourceOrThrowResolver,
    GroupByResourceResolver,

    // ResourcePrice queries
    AggregateResourcePriceResolver,
    FindFirstResourcePriceResolver,
    FindFirstResourcePriceOrThrowResolver,
    FindManyResourcePriceResolver,
    FindUniqueResourcePriceResolver,
    FindUniqueResourcePriceOrThrowResolver,
    GroupByResourcePriceResolver,

    // Transaction queries
    AggregateTransactionResolver,
    FindFirstTransactionResolver,
    FindFirstTransactionOrThrowResolver,
    FindManyTransactionResolver,
    FindUniqueTransactionResolver,
    FindUniqueTransactionOrThrowResolver,
    GroupByTransactionResolver,

    // Attestation queries
    AggregateAttestationResolver,
    FindFirstAttestationResolver,
    FindFirstAttestationOrThrowResolver,
    FindManyAttestationResolver,
    FindUniqueAttestationResolver,
    FindUniqueAttestationOrThrowResolver,
    GroupByAttestationResolver,

    // Condition queries
    AggregateConditionResolver,
    FindFirstConditionResolver,
    FindFirstConditionOrThrowResolver,
    FindManyConditionResolver,
    FindUniqueConditionResolver,
    FindUniqueConditionOrThrowResolver,
    GroupByConditionResolver,
  ];

  // Build the GraphQL schema with query resolvers, relation resolvers, and custom resolvers
  const allResolvers = queryResolvers
    .concat(relationResolvers)
    .concat([CandleResolver, PnLResolver, VolumeResolver, ScoreResolver]);
  const schema = await buildSchema({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvers: allResolvers as any,
    validate: false,
    emitSchemaFile: true,
  });

  // Create Apollo Server with the combined schema and depth limit
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
    ],
  });

  await apolloServer.start();

  // Get the singleton instance
  const sharedSchema = SharedSchema.getInstance();

  // Set the combined schema (with both generated and custom resolvers)
  sharedSchema.setSchema(schema);

  return apolloServer;
};

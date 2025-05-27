import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import { buildSchema } from 'type-graphql';
import {
  MarketGroupResolver,
  PositionResolver,
  ResourceResolver,
  TransactionResolver,
  CandleResolver,
  PnLResolver,
  VolumeResolver,
  CategoryResolver,
  MarketResolver,
} from './resolvers';
import { SharedSchema } from './sharedSchema';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApolloContext {}

export const initializeApolloServer = async () => {
  // Create GraphQL schema
  const schema = await buildSchema({
    resolvers: [
      MarketGroupResolver,
      MarketResolver,
      ResourceResolver,
      PositionResolver,
      TransactionResolver,
      CandleResolver,
      PnLResolver,
      VolumeResolver,
      CategoryResolver,
    ],
    emitSchemaFile: true,
    validate: false,
  });

  // Create Apollo Server
  const apolloServer = new ApolloServer({
    schema,
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return error;
    },
    introspection: true,
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
      responseCachePlugin(),
    ],
  });

  // Start Apollo Server
  await apolloServer.start();

  // Get the singleton instance
  const sharedSchema = SharedSchema.getInstance();

  // Set the schema
  sharedSchema.setSchema(schema);

  return apolloServer;
};

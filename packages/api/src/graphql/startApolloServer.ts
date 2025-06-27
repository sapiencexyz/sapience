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

// Import generated CRUD resolvers
import {
  MarketCrudResolver,
  Market_groupCrudResolver,
  PositionCrudResolver,
  TransactionCrudResolver,
  ResourceCrudResolver,
  CategoryCrudResolver,
  EventCrudResolver,
  Cache_candleCrudResolver,
  Cache_paramCrudResolver,
  Collateral_transferCrudResolver,
  Crypto_pricesCrudResolver,
  Market_priceCrudResolver,
  MigrationsCrudResolver,
  Render_jobCrudResolver,
  Resource_priceCrudResolver,
} from '@generated/type-graphql';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApolloContext {}

export const initializeApolloServer = async () => {
  // Create GraphQL schema
  const schema = await buildSchema({
    resolvers: [
      // Your custom resolvers (now using generated types!)
      MarketGroupResolver, // ✅ Custom business logic + generated Market_group type
      MarketResolver, // ✅ Custom business logic + generated Market type
      ResourceResolver, // ✅ Custom business logic + generated Resource type
      PositionResolver, // ✅ Custom business logic + generated Position type
      TransactionResolver, // ✅ Custom business logic + generated Transaction type
      CandleResolver, // ✅ No conflicts
      PnLResolver, // ✅ No conflicts
      VolumeResolver, // ✅ No conflicts
      CategoryResolver, // ✅ Custom business logic + generated Category type

      // Generated CRUD resolvers - these add full CRUD operations!
      MarketCrudResolver, // Full CRUD for Market (works with your custom MarketResolver!)
      Market_groupCrudResolver, // Full CRUD for Market_group (works with your custom MarketGroupResolver!)
      PositionCrudResolver, // Full CRUD for Position (works with your custom PositionResolver!)
      TransactionCrudResolver, // Full CRUD for Transaction (works with your custom TransactionResolver!)
      ResourceCrudResolver, // Full CRUD for Resource (works with your custom ResourceResolver!)
      CategoryCrudResolver, // Full CRUD for Category (works with your custom CategoryResolver!)
      EventCrudResolver, // Full CRUD for Event
      Cache_candleCrudResolver, // Full CRUD for Cache_candle
      Cache_paramCrudResolver, // Full CRUD for Cache_param
      Collateral_transferCrudResolver, // Full CRUD for Collateral_transfer
      Crypto_pricesCrudResolver, // Full CRUD for Crypto_prices
      Market_priceCrudResolver, // Full CRUD for Market_price
      MigrationsCrudResolver, // Full CRUD for Migrations
      Render_jobCrudResolver, // Full CRUD for Render_job
      Resource_priceCrudResolver, // Full CRUD for Resource_price
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

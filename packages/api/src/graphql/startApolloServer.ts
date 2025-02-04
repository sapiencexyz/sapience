import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { buildSchema } from 'type-graphql';
import {
  EpochResolver,
  MarketResolver,
  PositionResolver,
  ResourceResolver,
  TransactionResolver,
  CandleResolver,
} from './resolvers';

export const initializeApolloServer = async () => {
    // Create GraphQL schema
    const schema = await buildSchema({
      resolvers: [
        MarketResolver,
        ResourceResolver,
        PositionResolver,
        TransactionResolver,
        EpochResolver,
        CandleResolver,
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
      ],
    });
  
    // Start Apollo Server
    await apolloServer.start();
    
    return apolloServer;
  };
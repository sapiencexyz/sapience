import { initializeDataSource } from './db';
import { buildSchema } from 'type-graphql';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import {
  MarketResolver,
  ResourceResolver,
  PositionResolver,
  TransactionResolver,
  EpochResolver,
} from './graphql/resolvers';
import { createLoaders } from './graphql/loaders';
import { app } from './app';
import dotenv from 'dotenv';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import initSentry from './instrument';

const PORT = 3001;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

initSentry();

const startServer = async () => {
  await initializeDataSource();

  // Create GraphQL schema
  const schema = await buildSchema({
    resolvers: [
      MarketResolver,
      ResourceResolver,
      PositionResolver,
      TransactionResolver,
      EpochResolver,
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

  // Add GraphQL endpoint
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async () => ({
        loaders: createLoaders(),
      }),
    })
  );

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`GraphQL endpoint available at /graphql`);
  });
};

try {
  await startServer();
} catch (e) {
  console.error('Unable to start server: ', e);
}

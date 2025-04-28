import { initializeDataSource, resourceRepository } from './db';
import { expressMiddleware } from '@apollo/server/express4';
import { createLoaders } from './graphql/loaders';
import { app } from './app';
import dotenv from 'dotenv';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import initSentry from './instrument';
import { initializeApolloServer } from './graphql/startApolloServer';
import Sentry from './sentry';
import { NextFunction, Request, Response } from 'express';
import { ResourcePerformanceManager } from './performance';
import { initializeFixtures } from './fixtures';

const PORT = 3001;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

initSentry();

const startServer = async () => {
  await initializeDataSource();

  // console.log('process.env.NODE_ENV', process.env.NODE_ENV);
  // console.log('process.env.DATABASE_URL', process.env.DATABASE_URL);
  // Initialize fixtures from fixtures.json
  if (process.env.NODE_ENV === 'development' && process.env.DATABASE_URL?.includes('render')) {
    console.log('Skipping fixtures initialization since we are in development mode and using production database');
  } else {
    await initializeFixtures();
  }

  const apolloServer = await initializeApolloServer();

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

  // Only set up Sentry error handling in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.setupExpressErrorHandler(app);
  }

  // console.log('ResourcePerformanceManager - Starting');
  // const resources = await resourceRepository.find();

  // TESTING ONLY - SELECT A SINGLE RESOURCE SO THAT YOU WON'T HAVE TO CACHE EVERYTHING
  const resources = (await resourceRepository.find()).filter((res) => res.id === 8);

  const resourcePerformanceManager = ResourcePerformanceManager.getInstance();
  await resourcePerformanceManager.initialize(resources);
  console.log('ResourcePerformanceManager - Initialized');

  // Global error handle
  // Needs the unused _next parameter to be passed in: https://expressjs.com/en/guide/error-handling.html
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('An error occurred:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });
};

try {
  await startServer();
} catch (e) {
  console.error('Unable to start server: ', e);
}

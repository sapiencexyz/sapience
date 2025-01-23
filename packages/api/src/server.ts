import { initializeDataSource } from './db';
import { expressMiddleware } from '@apollo/server/express4';
import { createLoaders } from './graphql/loaders';
import { app } from './app';
import dotenv from 'dotenv';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import initSentry from './instrument';
import { initializeApolloServer } from './graphql/startApolloServer';
import Sentry from './sentry';
import { Request, Response } from 'express';

const PORT = 3001;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

initSentry();

const startServer = async () => {
  await initializeDataSource();

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

  // Global error handler
  app.use((err: Error, req: Request, res: Response) => {
    console.error('An error occurred:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });
};

try {
  await startServer();
} catch (e) {
  console.error('Unable to start server: ', e);
}

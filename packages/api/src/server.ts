import 'reflect-metadata';
import { initializeDataSource } from './db';
import { expressMiddleware } from '@apollo/server/express4';
import { createLoaders } from './graphql/loaders';
import { app } from './app';
import { createServer } from 'http';
import { attachRfqWebSocketServer } from './rfq/ws';
import dotenv from 'dotenv';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { initSentry } from './instrument';
import { initializeApolloServer } from './graphql/startApolloServer';
import Sentry from './instrument';
import { NextFunction, Request, Response } from 'express';
import { initializeFixtures } from './fixtures';
import { handleMcpAppRequests } from './routes/mcp';
import prisma from './db';
const PORT = 3001;

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

initSentry();

const startServer = async () => {
  await initializeDataSource();

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.DATABASE_URL?.includes('render')
  ) {
    console.log(
      'Skipping fixtures initialization since we are in development mode and using production database'
    );
  } else {
    // Initialize fixtures from fixtures.json
    await initializeFixtures();
  }

  const apolloServer = await initializeApolloServer();

  // Add GraphQL endpoint
  app.use(
    '/graphql',
    expressMiddleware(apolloServer, {
      context: async () => ({
        loaders: createLoaders(),
        prisma,
      }),
    })
  );

  handleMcpAppRequests(app, '/mcp');

  const httpServer = createServer(app);
  const rfqWsEnabled = process.env.ENABLE_RFQ_WS !== 'false';
  if (rfqWsEnabled) {
    attachRfqWebSocketServer(httpServer);
  } else {
    console.log('RFQ WebSocket server disabled via ENABLE_RFQ_WS=false');
  }
  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`GraphQL endpoint available at /graphql`);
    if (rfqWsEnabled) {
      console.log(`WS endpoint available at /ws/rfq`);
    }
  });

  // Only set up Sentry error handling in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.setupExpressErrorHandler(app);
  }

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

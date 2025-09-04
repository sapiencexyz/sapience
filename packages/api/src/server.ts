import 'reflect-metadata';
import { initializeDataSource } from './db';
import { expressMiddleware } from '@apollo/server/express4';
import { createLoaders } from './graphql/loaders';
import { app } from './app';
import { createServer } from 'http';
import { createAuctionWebSocketServer } from './auction/ws';
import { createChatWebSocketServer } from './websocket/chat';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
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

  // Create WebSocket servers (noServer mode) and route upgrades centrally
  const auctionWsEnabled = process.env.ENABLE_AUCTION_WS !== 'false';
  const auctionWss = auctionWsEnabled ? createAuctionWebSocketServer() : null;
  const chatWss = createChatWebSocketServer();

  httpServer.on(
    'upgrade',
    (request: IncomingMessage, socket: Socket, head: Buffer) => {
      try {
        const url = request.url || '/';
        // Origin validation for staging/prod if configured
        if (
          url.startsWith('/chat') &&
          process.env.NODE_ENV !== 'development' &&
          process.env.CHAT_ALLOWED_ORIGINS
        ) {
          const origin = request.headers['origin'] as string | undefined;
          const allowed = new Set(
            process.env.CHAT_ALLOWED_ORIGINS.split(',').map((s) => s.trim())
          );
          if (!origin || !Array.from(allowed).some((o) => origin === o)) {
            try {
              socket.destroy();
            } catch {
              /* ignore */
            }
            return;
          }
        }
        if (auctionWsEnabled && url.startsWith('/auction') && auctionWss) {
          auctionWss.handleUpgrade(request, socket, head, (ws) => {
            auctionWss.emit('connection', ws, request);
          });
          return;
        }
        if (url.startsWith('/chat')) {
          chatWss.handleUpgrade(request, socket, head, (ws) => {
            chatWss.emit('connection', ws, request);
          });
          return;
        }
      } catch {
        /* ignore */
      }
      // If not handled, destroy the socket
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    }
  );

  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`GraphQL endpoint available at /graphql`);
    if (auctionWsEnabled) console.log(`Auction WebSocket endpoint at /auction`);
    console.log(`Chat WebSocket endpoint at /chat`);
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

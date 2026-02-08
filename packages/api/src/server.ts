import 'reflect-metadata';
import { initializeDataSource } from './db';
import { expressMiddleware } from '@as-integrations/express4';
import { createLoaders } from './graphql/loaders';
import { app } from './app';
import { createServer } from 'http';
import { createChatWebSocketServer } from './websocket/chat';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { initSentry } from './instrument';
import { initializeApolloServer } from './graphql/startApolloServer';
import Sentry from './instrument';
import express, { NextFunction, Request, Response } from 'express';
import { initializeFixtures } from './fixtures';
import { handleMcpAppRequests } from './routes/mcp';
import prisma from './db';
import { config } from './config';
import {
  createAuctionProxyMiddleware,
  proxyAuctionWebSocket,
} from './utils/auctionProxy';

const PORT = 3001;

initSentry();

const startServer = async () => {
  await initializeDataSource();

  if (config.isDev && process.env.DATABASE_URL?.includes('render')) {
    console.log(
      'Skipping fixtures initialization since we are in development mode and using production database'
    );
  } else {
    // Initialize fixtures from fixtures.json
    await initializeFixtures();
  }

  const apolloServer = await initializeApolloServer();

  // Add GraphQL endpoint with payload size limit and request timeout
  app.use(
    '/graphql',
    express.json({ limit: '100kb' }),
    // Request timeout middleware
    (req: Request, res: Response, next: NextFunction) => {
      const timeout = config.GRAPHQL_REQUEST_TIMEOUT_MS;
      res.setTimeout(timeout, () => {
        if (!res.headersSent) {
          res.status(408).json({
            errors: [{ message: `Request timeout after ${timeout}ms` }],
          });
        }
      });
      next();
    },
    expressMiddleware(apolloServer, {
      context: async () => ({
        loaders: createLoaders(),
        prisma,
      }),
    })
  );

  handleMcpAppRequests(app, '/mcp');

  // Proxy /auction HTTP requests to auction service
  const auctionProxyEnabled = process.env.ENABLE_AUCTION_PROXY !== 'false';
  if (auctionProxyEnabled) {
    app.use('/auction', createAuctionProxyMiddleware());
    console.log('Auction proxy enabled: /auction -> auction service');
  }

  const httpServer = createServer(app);

  // Create WebSocket server and route upgrades centrally
  const chatWss = createChatWebSocketServer();

  httpServer.on(
    'upgrade',
    async (request: IncomingMessage, socket: Socket, head: Buffer) => {
      try {
        const url = request.url || '/';
        // Origin validation for prod if configured
        if (
          url.startsWith('/chat') &&
          !config.isDev &&
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
        if (url.startsWith('/chat')) {
          chatWss.handleUpgrade(request, socket, head, (ws) => {
            chatWss.emit('connection', ws, request);
          });
          return;
        }
        // Proxy /auction WebSocket upgrades to auction service
        if (auctionProxyEnabled && url.startsWith('/auction')) {
          const proxied = await proxyAuctionWebSocket(request, socket, head);
          if (proxied) {
            return;
          }
          // If proxy failed, fall through to destroy socket
        }
      } catch (err) {
        console.error('[Server] Upgrade handler error:', err);
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
    console.log(`Chat WebSocket endpoint at /chat`);
    if (auctionProxyEnabled) {
      console.log(`Auction WebSocket endpoint proxied at /auction`);
    }
  });

  // Only set up Sentry error handling in production
  if (config.isProd) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Global error handle
  // Needs the unused _next parameter to be passed in: https://expressjs.com/en/guide/error-handling.html
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('An error occurred:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

try {
  await startServer();
} catch (e) {
  console.error('Unable to start server: ', e);
}

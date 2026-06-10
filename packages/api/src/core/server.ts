import { initializeDataSource } from './db';
import { expressMiddleware } from '@as-integrations/express4';
import { app } from './app';
import { createServer } from 'http';
import { createChatWebSocketServer } from '../websocket/chat';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { initSentry } from './instrument';
import { initializeApolloServer } from '../graphql/startApolloServer';
import { startInflightDump } from '../runtime/inflightDump';
import Sentry from './instrument';
import { NextFunction, Request, Response } from 'express';
import { initializeFixtures } from '../fixtures';
import { seedFixturesWithRetry } from './seedFixtures';
import prisma, { runWithoutQueryTimeout } from './db';
import { config } from './config';
import { createLogger } from './logger';
import { createConcurrencyLimiter } from '../runtime/concurrencyLimiter';
import {
  createAuctionProxyMiddleware,
  proxyAuctionWebSocket,
} from '../lib/auctionProxy';
import { cdnCacheMiddleware } from '../graphql/plugins/httpCacheHeadersPlugin';
import { requestContext } from './db';

const log = createLogger('server');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

initSentry();

const startServer = async () => {
  await initializeDataSource();

  // Seed fixtures from fixtures.json before serving. Boot queries bypass the
  // request-path 8s timeout (runWithoutQueryTimeout) so a slow cold-boot query
  // isn't killed. Two outcomes, by design:
  //   - definitive failure (every retry errors out) -> seedFixturesWithRetry
  //     throws -> the outer catch process.exit(1)s -> the platform restarts.
  //     A deploy that genuinely can't seed should fail loudly, not serve.
  //   - slow/hung seed (exceeds FIXTURE_SEED_TIMEOUT_MS) -> non-fatal: bind
  //     the port and serve (logged to Sentry). Crashing on slowness would
  //     just re-create the boot-timeout -> permanent-502 incident as a
  //     crash-loop.
  if (config.isDev && process.env.DATABASE_URL?.includes('railway')) {
    log.info(
      'Skipping fixtures initialization (dev mode + production database)'
    );
  } else {
    await seedFixturesWithRetry(
      () => runWithoutQueryTimeout(() => initializeFixtures()),
      { overallTimeoutMs: config.FIXTURE_SEED_TIMEOUT_MS }
    );
  }

  const apolloServer = await initializeApolloServer();

  // Health check endpoint — verifies DB connectivity for load balancers
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unhealthy' });
    }
  });

  // Concurrency limiter — shed load when too many GraphQL operations are in-flight.
  // Two-level: global limit + per-IP limit to prevent one client monopolizing all slots.
  const { timeoutMiddleware, concurrencyMiddleware } = createConcurrencyLimiter(
    {
      maxConcurrent: config.GRAPHQL_MAX_CONCURRENT_OPERATIONS,
      maxConcurrentPerIp: config.GRAPHQL_MAX_CONCURRENT_PER_IP,
      requestTimeoutMs: config.GRAPHQL_REQUEST_TIMEOUT_MS,
      onGlobalShed: (ip, activeOperations) => {
        Sentry.captureMessage(
          `Load shedding: ${activeOperations} active operations (max ${config.GRAPHQL_MAX_CONCURRENT_OPERATIONS})`,
          {
            level: 'warning',
            extra: { ip, activeOperations },
          }
        );
      },
    }
  );

  // Add GraphQL endpoint with concurrency limiting and request timeout.
  //
  // Two log lines fire per /graphql request — `http_graphql_request`
  // here (HTTP layer: status code, prismaQueryCount, IP, requestId) and
  // `gql_request` in operationTimingPlugin (GraphQL layer: operation
  // name, rootResolvers, errors, complexity). They're joined by
  // requestId for end-to-end attribution. The HTTP-layer pino-http
  // autoLogger ignores /graphql to keep it to exactly these two.
  app.use(
    '/graphql',
    // Per-request timing + query counter + request ID
    (req: Request, res: Response, next: NextFunction) => {
      const requestId = (req.headers['x-request-id'] as string) || '';
      const store = { count: 0, requestId };
      requestContext.run(store, () => {
        const start = performance.now();
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        res.on('finish', () => {
          const durationMs = Number((performance.now() - start).toFixed(1));
          log.info(
            {
              event: 'http_graphql_request',
              method: req.method,
              statusCode: res.statusCode,
              durationMs,
              prismaQueryCount: store.count,
              ip,
              requestId: requestId || undefined,
            },
            'http /graphql'
          );
        });
        next();
      });
    },
    // Request timeout first — defends against slowloris (slow body delivery holding slots)
    timeoutMiddleware,
    // Concurrency limiter — global + per-IP
    concurrencyMiddleware,
    // CDN cache headers — intercepts writeHead to set Cache-Control
    // after Apollo's responseCachePlugin has finished
    cdnCacheMiddleware as unknown as (
      req: Request,
      res: Response,
      next: NextFunction
    ) => void,
    expressMiddleware(apolloServer, {
      context: async ({ req }) => ({
        prisma,
        pickConditions: new Map<string, unknown>(),
        // pino-http attaches `id` and `log` to req; passed through so the
        // operation-timing plugin can include reqId in the structured log.
        req,
      }),
    })
  );

  // Proxy /auction HTTP requests to auction service
  const auctionProxyEnabled = process.env.ENABLE_AUCTION_PROXY !== 'false';
  if (auctionProxyEnabled) {
    app.use('/auction', createAuctionProxyMiddleware());
    log.info('Auction proxy enabled: /auction -> auction service');
  }

  const httpServer = createServer(app);

  // Socket-level timeouts.
  //
  // Node defaults (60s headers / 5min request / 5s keepalive) leave a
  // slowloris vector on the slow-body path — tightening headers /
  // request closes it without affecting legitimate clients, whose
  // headers complete in <100ms.
  //
  // `keepAliveTimeout` is held *above* the typical AWS ALB idle (60s)
  // so the upstream connection always closes from the LB side first.
  // If Node closed first, the LB could send a new request onto a
  // half-closed connection and surface a 502 to the client. Node's
  // own default (5s) is below the ALB idle and is the exact trigger
  // for those spurious 502s.
  //
  // `headersTimeout` must be > `keepAliveTimeout` (Node enforces
  // this).
  httpServer.headersTimeout = 70_000;
  httpServer.requestTimeout = 20_000;
  httpServer.keepAliveTimeout = 65_000;

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
        log.error({ err }, 'Upgrade handler error');
      }
      // If not handled, destroy the socket
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    }
  );

  // Periodic gauge dump — disabled by default (interval <= 0). Opt in via
  // GRAPHQL_INFLIGHT_DUMP_INTERVAL_MS for benchmarks or low-rate prod monitoring.
  const stopInflightDump = startInflightDump(
    config.GRAPHQL_INFLIGHT_DUMP_INTERVAL_MS
  );

  httpServer.listen(PORT, () => {
    log.info({ port: PORT, auctionProxyEnabled }, 'Server listening');
  });

  // Graceful shutdown — drain in-flight requests before exiting
  const shutdown = async () => {
    log.info('Shutting down gracefully');
    stopInflightDump();
    httpServer.close(() => {
      log.info('HTTP server closed');
      prisma.$disconnect().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Only set up Sentry error handling in production
  if (config.isProd) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Global error handle
  // Needs the unused _next parameter to be passed in: https://expressjs.com/en/guide/error-handling.html
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error({ err }, 'Unhandled error in request pipeline');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};

try {
  await startServer();
} catch (err) {
  // Exit so the platform restarts the container. Without this the process
  // lingers (the pg pool keeps the event loop alive) with no HTTP listener
  // bound, returning 502 for every request indefinitely — a failed boot
  // must crash-and-restart, not become a portless zombie.
  log.fatal({ err }, 'Unable to start server');
  process.exit(1);
}

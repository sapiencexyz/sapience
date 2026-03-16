import { createServer } from 'http';
import { createAuctionWebSocketServer } from './ws';
import { createSignalWebSocketServer } from './signal';
import { initSentry } from './instrument';
import { config } from './config';
import { getMetrics } from './metrics';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

const PORT = parseInt(config.PORT, 10);

initSentry();

const startServer = async () => {
  let serverStartTime: number;
  let httpServer: ReturnType<typeof createServer> | null = null;
  let auctionWss: ReturnType<typeof createAuctionWebSocketServer> | null = null;

  const httpServerInstance = createServer(async (req, res) => {
    // Expose metrics endpoint
    if (req.url === '/metrics' && req.method === 'GET') {
      try {
        const metrics = await getMetrics();
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        res.end(metrics);
      } catch (err) {
        console.error('[Metrics] Error generating metrics:', err);
        res.writeHead(500);
        res.end('Error generating metrics');
      }
      return;
    }

    // Health check endpoint
    if (req.url === '/health' && req.method === 'GET') {
      const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptime: uptimeSeconds,
        })
      );
      return;
    }

    // WebSocket-only endpoints
    if (req.url?.startsWith('/signal') || req.url?.startsWith('/auction')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error:
            'This endpoint only supports WebSocket connections. Use ws:// or wss:// protocol.',
        })
      );
      return;
    }

    // 404 for other routes
    res.writeHead(404);
    res.end('Not Found');
  });

  // Create WebSocket servers
  const auctionWsEnabled = config.ENABLE_AUCTION_WS;
  auctionWss = auctionWsEnabled ? createAuctionWebSocketServer() : null;
  const signalWss = createSignalWebSocketServer();

  httpServerInstance.on(
    'upgrade',
    (request: IncomingMessage, socket: Socket, head: Buffer) => {
      try {
        const url = request.url || '/';

        // Route /signal WebSocket connections (WebRTC peer discovery)
        if (url.startsWith('/signal')) {
          signalWss.handleUpgrade(request, socket, head, (ws) => {
            signalWss.emit('connection', ws, request);
          });
          return;
        }

        // Route /auction WebSocket connections
        if (auctionWsEnabled && url.startsWith('/auction') && auctionWss) {
          auctionWss.handleUpgrade(request, socket, head, (ws) => {
            auctionWss.emit('connection', ws, request);
          });
          return;
        }

        // If not handled, destroy the socket
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    }
  );

  httpServer = httpServerInstance;
  httpServer.listen(PORT, () => {
    serverStartTime = Date.now();
    console.log(`Relayer service is running on port ${PORT}`);
    console.log(`Metrics endpoint: http://localhost:${PORT}/metrics`);
    console.log(`Health check endpoint: http://localhost:${PORT}/health`);
    console.log(`Signal endpoint: ws://localhost:${PORT}/signal`);
    if (auctionWsEnabled) {
      console.log(`WebSocket endpoint: ws://localhost:${PORT}/auction`);
    }
  });

  // Graceful shutdown handler
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received, starting graceful shutdown...`);

    // Stop accepting new connections
    if (httpServer) {
      httpServer.close(() => {
        console.log('HTTP server closed');
      });
    }

    // Close signal WebSocket connections
    for (const client of signalWss.clients) {
      if (
        client.readyState === client.OPEN ||
        client.readyState === client.CONNECTING
      ) {
        client.close(1001, 'server_shutting_down');
      }
    }

    // Close all WebSocket connections
    if (auctionWss) {
      const clients = Array.from(auctionWss.clients);
      console.log(`Closing ${clients.length} WebSocket connections...`);

      // Close all connections with a reason
      clients.forEach((ws) => {
        if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
          ws.close(1001, 'server_shutting_down');
        }
      });

      // Wait for connections to close (max 10 seconds)
      const closePromise = new Promise<void>((resolve) => {
        if (clients.length === 0) {
          resolve();
          return;
        }

        let closedCount = 0;
        clients.forEach((ws) => {
          ws.on('close', () => {
            closedCount++;
            if (closedCount === clients.length) {
              resolve();
            }
          });
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          console.log('Timeout waiting for connections to close');
          resolve();
        }, 10000);
      });

      await closePromise;
      console.log('All WebSocket connections closed');
    }

    console.log('Graceful shutdown complete');
    process.exit(0);
  };

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

startServer().catch((err) => {
  console.error('Failed to start auction server:', err);
  process.exit(1);
});

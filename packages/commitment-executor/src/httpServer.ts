/**
 * Tiny HTTP server exposing `/metrics` and `/health`. Modeled on the
 * relayer's inline server. Kept in its own module so tests don't need
 * to touch actual sockets.
 */

import { createServer, type Server } from 'http';
import type { Logger } from './logger';
import { getMetrics } from './metrics';

export interface HttpServerHandle {
  server: Server;
  close: () => Promise<void>;
}

export function startMetricsServer(port: number, logger: Logger): HttpServerHandle {
  const startedAt = Date.now();
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/metrics' && req.method === 'GET') {
        const metrics = await getMetrics();
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
        res.end(metrics);
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      logger.error('metrics server error', { err: (err as Error).message });
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });
  void startedAt; // silence unused warning; exposing uptime is done by health server
  server.listen(port, () => {
    logger.info('metrics server listening', { port, url: `http://localhost:${port}/metrics` });
  });
  return { server, close: () => closeServer(server) };
}

export function startHealthServer(port: number, logger: Logger, isReady: () => boolean): HttpServerHandle {
  const startedAt = Date.now();
  const server = createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: uptimeSeconds }));
      return;
    }
    if (req.url === '/health/ready' && req.method === 'GET') {
      const ready = isReady();
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready }));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });
  server.listen(port, () => {
    logger.info('health server listening', { port, url: `http://localhost:${port}/health` });
  });
  return { server, close: () => closeServer(server) };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';
import http from 'http';
import https from 'https';
import type { Request, Response } from 'express';
import type { Socket } from 'net';

/**
 * Get the relayer service URL from environment or default to localhost.
 */
function getAuctionServiceUrl(): string {
  const url =
    process.env.RELAYER_SERVICE_URL ||
    (config.isDev ? 'http://localhost:3002' : 'http://localhost:3002');
  return url.replace(/\/$/, ''); // Remove trailing slash
}

/**
 * Create Express middleware to proxy HTTP requests to the auction service
 */
export function createAuctionProxyMiddleware() {
  const target = getAuctionServiceUrl();
  console.log('[Auction Proxy] Auction service URL:', target);

  return createProxyMiddleware<Request, Response>({
    target,
    changeOrigin: true,
    ws: false, // We handle WebSocket upgrades separately
    on: {
      error: (err: Error, req: Request, res: Response | Socket) => {
        console.error('[Auction Proxy] Error proxying request:', err.message);
        // Only handle HTTP responses, not WebSocket sockets
        if ('status' in res && !res.headersSent) {
          res.status(502).json({ error: 'Auction service unavailable' });
        }
      },
      proxyReq: (proxyReq: http.ClientRequest, req: Request) => {
        console.log('[Auction Proxy] Proxy request:', req.method, req.url);
        // Preserve original host header for proper routing
        if (req.headers.host) {
          proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
        }
      },
      proxyRes: (proxyRes: http.IncomingMessage, req: Request) => {
        // Log all responses for monitoring
        if (proxyRes.statusCode) {
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
            console.log(
              `[Auction Proxy] Successfully proxied ${req.method} ${req.url} -> ${proxyRes.statusCode}`
            );
          } else if (proxyRes.statusCode >= 400) {
            console.warn(
              `[Auction Proxy] Upstream returned ${proxyRes.statusCode} for ${req.method} ${req.url}`
            );
          }
        }
        // Ensure status code is forwarded (http-proxy-middleware should do this automatically)
      },
    },
  });
}

/**
 * Proxy WebSocket upgrade requests to the auction service
 */
export async function proxyAuctionWebSocket(
  request: import('http').IncomingMessage,
  socket: import('net').Socket,
  head: Buffer
): Promise<boolean> {
  const target = getAuctionServiceUrl();
  const url = new URL(request.url || '/auction', target);

  return new Promise((resolve) => {
    console.log('[Auction Proxy] Creating proxy request for:', url.toString());

    // Use https module for HTTPS URLs, http for HTTP
    const requestModule = url.protocol === 'https:' ? https : http;

    // Create proxy request with upgrade header
    const proxyReq = requestModule.request({
      hostname: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: request.method,
      headers: {
        ...request.headers,
        host: url.host,
        connection: 'upgrade',
        upgrade: 'websocket',
      },
      // For HTTPS, reject unauthorized certificates in production
      rejectUnauthorized: config.NODE_ENV === 'production',
    });

    proxyReq.on('error', (err: Error) => {
      console.error(
        '[Auction Proxy] WebSocket proxy error:',
        err.message,
        err.stack
      );
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(false);
    });

    // Handle response (non-upgrade) - this shouldn't happen for WebSocket but log it
    proxyReq.on('response', (res) => {
      console.warn(
        `[Auction Proxy] Received non-upgrade response ${res.statusCode} for WebSocket request to ${url.toString()}`
      );
      // If we get a regular response instead of upgrade, something went wrong
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(false);
    });

    proxyReq.on(
      'upgrade',
      (
        proxyRes: import('http').IncomingMessage,
        proxySocket: import('net').Socket,
        proxyHead: Buffer
      ) => {
        // Log successful WebSocket upgrade
        if (proxyRes.statusCode === 101) {
          console.log(
            `[Auction Proxy] Successfully proxied WebSocket upgrade for ${request.url}`
          );
        } else {
          console.warn(
            `[Auction Proxy] WebSocket upgrade returned ${proxyRes.statusCode} for ${request.url}`
          );
        }
        // Upgrade successful, pipe the connection
        proxySocket.on('error', (err: Error) => {
          console.error('[Auction Proxy] Proxy socket error:', err.message);
          try {
            socket.destroy();
          } catch {
            /* ignore */
          }
        });

        socket.on('error', (err: Error) => {
          console.error('[Auction Proxy] Client socket error:', err.message);
          try {
            proxySocket.destroy();
          } catch {
            /* ignore */
          }
        });

        // Write upgrade response to client
        socket.write(
          `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`
        );
        Object.keys(proxyRes.headers).forEach((key) => {
          const value = proxyRes.headers[key];
          if (
            value &&
            key.toLowerCase() !== 'connection' &&
            key.toLowerCase() !== 'upgrade'
          ) {
            socket.write(
              `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`
            );
          }
        });
        socket.write('Connection: Upgrade\r\n');
        socket.write('Upgrade: websocket\r\n');
        socket.write('\r\n');

        // Handle head data first
        if (head && head.length > 0) {
          proxySocket.write(head);
        }
        if (proxyHead && proxyHead.length > 0) {
          socket.write(proxyHead);
        }

        // Pipe data between sockets (bidirectional)
        proxySocket.on('data', (chunk: Buffer) => {
          if (socket.writable) {
            socket.write(chunk);
          }
        });

        socket.on('data', (chunk: Buffer) => {
          if (proxySocket.writable) {
            proxySocket.write(chunk);
          }
        });

        proxySocket.on('close', () => {
          try {
            socket.destroy();
          } catch {
            /* ignore */
          }
        });

        socket.on('close', () => {
          try {
            proxySocket.destroy();
          } catch {
            /* ignore */
          }
        });

        resolve(true);
      }
    );

    // Send upgrade request with head data
    proxyReq.end(head);
  });
}

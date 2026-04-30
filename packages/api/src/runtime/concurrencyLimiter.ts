/**
 * GraphQL concurrency limiter middleware.
 *
 * Two-level load shedding:
 * 1. Global limit — total concurrent operations across all clients
 * 2. Per-IP limit — prevents a single IP from monopolizing all slots
 *
 * Also sets request timeout BEFORE body parsing to defend against
 * slowloris-style attacks that trickle POST bodies to hold slots.
 */

import type { Request, Response, NextFunction } from 'express';

export interface ConcurrencyLimiterOptions {
  maxConcurrent: number;
  maxConcurrentPerIp: number;
  requestTimeoutMs: number;
  onGlobalShed?: (ip: string, activeOperations: number) => void;
}

export function createConcurrencyLimiter(opts: ConcurrencyLimiterOptions) {
  const { maxConcurrent, maxConcurrentPerIp, requestTimeoutMs } = opts;
  let activeOperations = 0;
  const activePerIp = new Map<string, number>();

  function getIp(req: Request): string {
    const forwardedFor = (req.headers['x-forwarded-for'] as string)
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      (forwardedFor && forwardedFor.length > 0
        ? forwardedFor[forwardedFor.length - 1]
        : undefined) ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  // Middleware 1: Request timeout — runs before body parsing (slowloris defense)
  function timeoutMiddleware(
    _req: Request,
    res: Response,
    next: NextFunction
  ): void {
    res.setTimeout(requestTimeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({
          errors: [{ message: `Request timeout after ${requestTimeoutMs}ms` }],
        });
      }
    });
    next();
  }

  // Middleware 2: Concurrency check — global + per-IP
  function concurrencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const ip = getIp(req);

    // Global limit
    if (activeOperations >= maxConcurrent) {
      console.warn(
        `[Server] 429 load shed: ${activeOperations}/${maxConcurrent} active, ip=${ip}, path=${req.path}`
      );
      opts.onGlobalShed?.(ip, activeOperations);
      res
        .set('Retry-After', '1')
        .status(429)
        .json({
          errors: [
            {
              message: 'Server is busy. Please retry shortly.',
              extensions: { code: 'SERVER_BUSY' },
            },
          ],
        });
      return;
    }

    // Per-IP limit
    const ipOps = activePerIp.get(ip) ?? 0;
    if (ipOps >= maxConcurrentPerIp) {
      console.warn(
        `[Server] 429 per-IP limit: ${ipOps}/${maxConcurrentPerIp} active for ip=${ip}`
      );
      res
        .set('Retry-After', '1')
        .status(429)
        .json({
          errors: [
            {
              message:
                'Too many concurrent requests from this IP. Please retry shortly.',
              extensions: { code: 'IP_CONCURRENCY_EXCEEDED' },
            },
          ],
        });
      return;
    }

    activeOperations++;
    activePerIp.set(ip, ipOps + 1);
    res.on('finish', () => {
      activeOperations--;
      const current = activePerIp.get(ip) ?? 1;
      if (current <= 1) {
        activePerIp.delete(ip);
      } else {
        activePerIp.set(ip, current - 1);
      }
    });
    next();
  }

  return { timeoutMiddleware, concurrencyMiddleware };
}

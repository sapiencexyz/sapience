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
import { createHash } from 'node:crypto';
import { createLogger } from '../core/logger';

const log = createLogger('concurrency-limiter');

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

  function getRequestId(req: Request): string | undefined {
    const requestId = req.headers['x-request-id'];
    return typeof requestId === 'string' && requestId ? requestId : undefined;
  }

  function getOperationName(req: Request): string | undefined {
    const queryOperationName = req.query.operationName;
    if (typeof queryOperationName === 'string' && queryOperationName) {
      return queryOperationName;
    }

    const body = req.body as { operationName?: unknown } | undefined;
    return typeof body?.operationName === 'string' && body.operationName
      ? body.operationName
      : undefined;
  }

  function getQueryHash(req: Request): string | undefined {
    const query = req.query.query;
    const body = req.body as { query?: unknown } | undefined;
    const rawQuery = typeof query === 'string' ? query : body?.query;
    return typeof rawQuery === 'string' && rawQuery
      ? createHash('sha256').update(rawQuery).digest('hex').slice(0, 12)
      : undefined;
  }

  function getRequestLogContext(req: Request, ip: string) {
    return {
      ip,
      path: req.path,
      method: req.method,
      requestId: getRequestId(req),
      operationName: getOperationName(req),
      queryHash: getQueryHash(req),
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
      referer: req.headers.referer,
      xForwardedFor: req.headers['x-forwarded-for'],
    };
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
    const requestContext = getRequestLogContext(req, ip);

    // Global limit
    if (activeOperations >= maxConcurrent) {
      log.warn(
        {
          ...requestContext,
          activeOperations,
          maxConcurrent,
        },
        '429 load shed (global)'
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
      log.warn(
        { ...requestContext, ipOps, maxConcurrentPerIp, activeOperations },
        '429 per-IP concurrency limit'
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

    const activeAtStart = activeOperations;
    let cleanedUp = false;
    const cleanup = (reason: 'finish' | 'close') => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;

      activeOperations = Math.max(0, activeOperations - 1);
      const current = activePerIp.get(ip) ?? 0;
      const ipOperations = Math.max(0, current - 1);
      if (ipOperations === 0) {
        activePerIp.delete(ip);
      } else {
        activePerIp.set(ip, ipOperations);
      }

      const logContext = {
        ...requestContext,
        cleanupReason: reason,
        statusCode: res.statusCode,
        activeOperations,
        activeAtStart,
        ipOperations,
        completed: res.writableEnded,
      };

      if (reason === 'close' && !res.writableEnded) {
        log.warn(
          logContext,
          'GraphQL concurrency slot released on closed connection'
        );
      } else {
        log.debug(logContext, 'GraphQL concurrency slot released');
      }
    };

    res.on('finish', () => cleanup('finish'));
    res.on('close', () => cleanup('close'));
    next();
  }

  return { timeoutMiddleware, concurrencyMiddleware };
}

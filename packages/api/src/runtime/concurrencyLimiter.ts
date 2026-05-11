/**
 * GraphQL concurrency limiter middleware.
 *
 * Two-level load shedding:
 * 1. Global limit — total concurrent operations across all clients
 * 2. Per-IP limit — prevents a single IP from monopolizing all slots
 *
 * Also sets request timeout BEFORE body parsing to defend against
 * slowloris-style attacks that trickle POST bodies to hold slots.
 *
 * In-flight tracking lives in the shared `inflightRegistry` so the
 * Apollo plugin can attach the parsed operation name post-admission.
 * When a shed fires, the warn log includes a snapshot of the slots
 * currently occupied — answering "what got stuck" with server-derived
 * data that doesn't depend on client-supplied headers — plus the
 * rejected request's own context (path, claimed operation, query hash,
 * user-agent/origin/referer) for tracing the caller.
 */

import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { createLogger } from '../core/logger';
import { inflightRegistry } from './inflightRegistry';

const log = createLogger('concurrency-limiter');

export interface ConcurrencyLimiterOptions {
  maxConcurrent: number;
  maxConcurrentPerIp: number;
  requestTimeoutMs: number;
  onGlobalShed?: (ip: string, activeOperations: number) => void;
}

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

function getRequestId(req: Request): string {
  // pino-http's genReqId runs first and sets req.id (string from our config).
  // Fall back to the upstream header for stacks where pino-http is bypassed
  // (tests, scripts), then synthesize so the registry never collides.
  const reqId = (req as Request & { id?: string | number }).id;
  if (typeof reqId === 'string' && reqId) return reqId;
  if (typeof reqId === 'number') return String(reqId);
  const hdr = req.headers['x-request-id'];
  if (typeof hdr === 'string' && hdr) return hdr;
  return `synth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Body isn't parsed yet at admission time — fall back to client-supplied
// headers for the rejected request's claimed operation name. Trustworthy
// for our own benchmarks; the occupant snapshot uses server-parsed names
// for the requests already holding slots.
function getClaimedOperationName(req: Request): string | undefined {
  const explicit = req.headers['x-operation-name'];
  if (typeof explicit === 'string' && explicit) return explicit;
  const apolloName = req.headers['apollographql-client-name'];
  if (typeof apolloName === 'string' && apolloName) return apolloName;
  return undefined;
}

// First 12 hex chars of sha256(query). Useful when the query rides in the
// URL (GET) or has already been parsed onto req.body upstream; at admission
// time for a POST it's typically undefined, which is fine — it just won't
// appear on the log line.
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
    operationName: getClaimedOperationName(req),
    queryHash: getQueryHash(req),
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
    referer: req.headers.referer,
    xForwardedFor: req.headers['x-forwarded-for'],
  };
}

export function createConcurrencyLimiter(opts: ConcurrencyLimiterOptions) {
  const { maxConcurrent, maxConcurrentPerIp, requestTimeoutMs } = opts;

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
    const { requestId } = requestContext;

    // Global limit — protects total server capacity (CPU, DB pool, memory)
    if (inflightRegistry.active >= maxConcurrent) {
      const snap = inflightRegistry.snapshot();
      log.warn(
        {
          ...requestContext,
          event: 'gql_shed',
          layer: 'global',
          extensionsCode: 'SERVER_BUSY',
          activeOperations: snap.active,
          maxConcurrent,
          byOperation: snap.byOperation,
          occupants: snap.occupants,
        },
        'gql_shed global'
      );
      opts.onGlobalShed?.(ip, snap.active);
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

    // Per-IP limit — prevents one client from monopolizing global slots
    const ipOps = inflightRegistry.perIp(ip);
    if (ipOps >= maxConcurrentPerIp) {
      const snap = inflightRegistry.snapshot(ip);
      log.warn(
        {
          ...requestContext,
          event: 'gql_shed',
          layer: 'ip_concurrency',
          extensionsCode: 'IP_CONCURRENCY_EXCEEDED',
          ipOps: snap.perIp,
          maxConcurrentPerIp,
          occupants: snap.occupants,
        },
        'gql_shed ip_concurrency'
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

    inflightRegistry.add(requestId, ip);

    // `close` covers the client-aborted case where `finish` never fires.
    // The guard makes the double-fire a no-op; the registry tolerates
    // double-removal too, so this is belt-and-suspenders.
    let cleanedUp = false;
    const cleanup = (reason: 'finish' | 'close') => {
      if (cleanedUp) return;
      cleanedUp = true;
      inflightRegistry.remove(requestId);

      const logContext = {
        ...requestContext,
        cleanupReason: reason,
        statusCode: res.statusCode,
        activeOperations: inflightRegistry.active,
        ipOperations: inflightRegistry.perIp(ip),
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

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
 * data that doesn't depend on client-supplied headers.
 */

import type { Request, Response, NextFunction } from 'express';
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
// for our own benchmarks; the occupant snapshot below uses server-parsed
// names for the requests already holding slots.
function getClaimedOperationName(req: Request): string | undefined {
  const explicit = req.headers['x-operation-name'];
  if (typeof explicit === 'string' && explicit) return explicit;
  const apolloName = req.headers['apollographql-client-name'];
  if (typeof apolloName === 'string' && apolloName) return apolloName;
  return undefined;
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
    const requestId = getRequestId(req);
    const operationName = getClaimedOperationName(req);

    // Global limit — protects total server capacity (CPU, DB pool, memory)
    if (inflightRegistry.active >= maxConcurrent) {
      const snap = inflightRegistry.snapshot();
      log.warn(
        {
          event: 'gql_shed',
          layer: 'global',
          extensionsCode: 'SERVER_BUSY',
          activeOperations: snap.active,
          maxConcurrent,
          ip,
          requestId,
          operationName,
          path: req.path,
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
          event: 'gql_shed',
          layer: 'ip_concurrency',
          extensionsCode: 'IP_CONCURRENCY_EXCEEDED',
          ipOps: snap.perIp,
          maxConcurrentPerIp,
          ip,
          requestId,
          operationName,
          path: req.path,
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
    // Both events fire `remove`; the registry treats double-removal as a no-op.
    // `close` covers the client-aborted case where `finish` never fires.
    res.on('finish', () => inflightRegistry.remove(requestId));
    res.on('close', () => inflightRegistry.remove(requestId));
    next();
  }

  return { timeoutMiddleware, concurrencyMiddleware };
}

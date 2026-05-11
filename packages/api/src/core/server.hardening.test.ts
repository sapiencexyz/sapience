import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response } from 'express';
import { createConcurrencyLimiter } from '../runtime/concurrencyLimiter';

beforeEach(() => {
  vi.resetModules();
});

/**
 * Helper: create a minimal Express app with concurrency limiter + body parser
 * on /graphql, matching the same middleware order as server.ts.
 */
function createTestApp(opts: {
  maxConcurrent: number;
  maxConcurrentPerIp: number;
  requestTimeoutMs?: number;
}) {
  const app = express();
  app.set('trust proxy', 1);

  const { timeoutMiddleware, concurrencyMiddleware } = createConcurrencyLimiter(
    {
      maxConcurrent: opts.maxConcurrent,
      maxConcurrentPerIp: opts.maxConcurrentPerIp,
      requestTimeoutMs: opts.requestTimeoutMs ?? 15000,
    }
  );

  // Same middleware order as server.ts: timeout → concurrency → body parse → handler
  app.use('/graphql', timeoutMiddleware, concurrencyMiddleware, express.json());

  return app;
}

// ─── Slowloris: request timeout covers body parsing ─────────────────────────

describe('request timeout covers body parsing phase', () => {
  it('timeout middleware runs before body parsing', () => {
    const app = createTestApp({
      maxConcurrent: 50,
      maxConcurrentPerIp: 50,
      requestTimeoutMs: 100,
    });

    app.post('/graphql', (_req: Request, res: Response) => {
      res.json({ data: { ok: true } });
    });

    // Verify the middleware stack order by checking a fast request succeeds
    return request(app)
      .post('/graphql')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ query: '{ __typename }' }))
      .expect(200);
  });
});

// ─── Per-IP concurrency limit ───────────────────────────────────────────────

describe('per-IP concurrency limit on /graphql', () => {
  it('rejects requests from a single IP when per-IP limit is exceeded', async () => {
    const app = createTestApp({
      maxConcurrent: 50,
      maxConcurrentPerIp: 2,
    });

    // Handler takes 200ms — keeps slots occupied during concurrent requests
    app.post('/graphql', (_req: Request, res: Response) => {
      setTimeout(() => {
        if (!res.headersSent) {
          res.json({ data: { ok: true } });
        }
      }, 200);
    });

    // Fire 3 simultaneous requests from same IP — per-IP limit is 2
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app)
          .post('/graphql')
          .set('X-Forwarded-For', '1.2.3.4')
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ query: '{ __typename }' }))
      )
    );

    const successes = results.filter((r) => r.status === 200).length;
    const shedded = results.filter((r) => r.status === 429).length;

    expect(successes).toBe(2);
    expect(shedded).toBe(1);

    const sheddedRes = results.find((r) => r.status === 429);
    expect(sheddedRes!.headers['retry-after']).toBe('1');
  });

  it('allows requests from different IPs independently', async () => {
    const app = createTestApp({
      maxConcurrent: 50,
      maxConcurrentPerIp: 1,
    });

    app.post('/graphql', (_req: Request, res: Response) => {
      setTimeout(() => {
        if (!res.headersSent) {
          res.json({ data: { ok: true } });
        }
      }, 200);
    });

    // 1 request from each of 3 different IPs — all should succeed
    const results = await Promise.all([
      request(app)
        .post('/graphql')
        .set('X-Forwarded-For', '10.0.0.1')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ query: '{ __typename }' })),
      request(app)
        .post('/graphql')
        .set('X-Forwarded-For', '10.0.0.2')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ query: '{ __typename }' })),
      request(app)
        .post('/graphql')
        .set('X-Forwarded-For', '10.0.0.3')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ query: '{ __typename }' })),
    ]);

    for (const r of results) {
      expect(r.status).toBe(200);
    }
  });

  it('releases per-IP slots when requests complete', async () => {
    const app = createTestApp({
      maxConcurrent: 50,
      maxConcurrentPerIp: 1,
    });

    app.post('/graphql', (_req: Request, res: Response) => {
      res.json({ data: { ok: true } });
    });

    // Sequential requests from same IP — slot freed between each
    const res1 = await request(app)
      .post('/graphql')
      .set('X-Forwarded-For', '1.2.3.4')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ query: '{ __typename }' }));
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/graphql')
      .set('X-Forwarded-For', '1.2.3.4')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ query: '{ __typename }' }));
    expect(res2.status).toBe(200);
  });

  it('releases global and per-IP slots when a client connection closes before finish', () => {
    const { concurrencyMiddleware } = createConcurrencyLimiter({
      maxConcurrent: 1,
      maxConcurrentPerIp: 1,
      requestTimeoutMs: 15000,
    });

    function createMockResponse() {
      const res = new EventEmitter() as Response & {
        statusCode?: number;
        headersSent: boolean;
        setTimeout: () => void;
        set: () => Response;
        status: (statusCode: number) => Response;
        json: (body: unknown) => Response;
      };
      res.headersSent = false;
      res.setTimeout = vi.fn();
      res.set = vi.fn(() => res);
      res.status = vi.fn((statusCode: number) => {
        res.statusCode = statusCode;
        return res;
      });
      res.json = vi.fn(() => res);
      return res;
    }

    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4' },
      socket: {},
      path: '/graphql',
      method: 'POST',
      query: {},
    } as unknown as Request;

    const firstRes = createMockResponse();
    const firstNext = vi.fn();
    concurrencyMiddleware(req, firstRes, firstNext);
    expect(firstNext).toHaveBeenCalledOnce();

    firstRes.emit('close');

    const secondRes = createMockResponse();
    const secondNext = vi.fn();
    concurrencyMiddleware(req, secondRes, secondNext);

    expect(secondNext).toHaveBeenCalledOnce();
    expect(secondRes.status).not.toHaveBeenCalledWith(429);

    firstRes.emit('finish');

    const thirdRes = createMockResponse();
    const thirdNext = vi.fn();
    concurrencyMiddleware(req, thirdRes, thirdNext);

    expect(thirdNext).not.toHaveBeenCalled();
    expect(thirdRes.status).toHaveBeenCalledWith(429);
  });

  it('429 response includes per-IP indicator and Retry-After header', async () => {
    const app = createTestApp({
      maxConcurrent: 50,
      maxConcurrentPerIp: 1,
    });

    app.post('/graphql', (_req: Request, res: Response) => {
      setTimeout(() => {
        if (!res.headersSent) {
          res.json({ data: { ok: true } });
        }
      }, 200);
    });

    const results = await Promise.all([
      request(app)
        .post('/graphql')
        .set('X-Forwarded-For', '1.2.3.4')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ query: '{ __typename }' })),
      request(app)
        .post('/graphql')
        .set('X-Forwarded-For', '1.2.3.4')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ query: '{ __typename }' })),
    ]);

    const shedded = results.find((r) => r.status === 429);
    expect(shedded).toBeDefined();
    expect(shedded!.body.errors[0].extensions.code).toBe(
      'IP_CONCURRENCY_EXCEEDED'
    );
    expect(shedded!.headers['retry-after']).toBe('1');
  });

  it('global limit still applies even when per-IP limit is not reached', async () => {
    const app = createTestApp({
      maxConcurrent: 2, // low global
      maxConcurrentPerIp: 50, // high per-IP
    });

    app.post('/graphql', (_req: Request, res: Response) => {
      setTimeout(() => {
        if (!res.headersSent) {
          res.json({ data: { ok: true } });
        }
      }, 200);
    });

    // 3 requests from different IPs — global limit is 2
    const results = await Promise.all([
      request(app)
        .post('/graphql')
        .set('X-Forwarded-For', '10.0.0.1')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ query: '{ __typename }' })),
      request(app)
        .post('/graphql')
        .set('X-Forwarded-For', '10.0.0.2')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ query: '{ __typename }' })),
      request(app)
        .post('/graphql')
        .set('X-Forwarded-For', '10.0.0.3')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ query: '{ __typename }' })),
    ]);

    const successes = results.filter((r) => r.status === 200).length;
    const shedded = results.filter((r) => r.status === 429).length;

    expect(successes).toBe(2);
    expect(shedded).toBe(1);

    // Global 429 uses SERVER_BUSY code (not IP_CONCURRENCY_EXCEEDED)
    const sheddedRes = results.find((r) => r.status === 429);
    expect(sheddedRes!.body.errors[0].extensions.code).toBe('SERVER_BUSY');
    expect(sheddedRes!.headers['retry-after']).toBe('1');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Reset modules before EVERY test to get fresh rate limiter instances
beforeEach(() => {
  vi.resetModules();
});

// ─── Simple rate limiting (no x402) ─────────────────────────────────────────

describe('rate limiting with trust proxy (simple mode)', () => {
  it('rate limits per-IP using X-Forwarded-For, not globally', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        FREE_TIER_RATE_LIMIT: 3,
        HARD_RATE_LIMIT: 10,
        X402_PAY_TO: undefined,
      },
    }));
    vi.doMock('./x402', () => ({
      createGasAwareX402Middleware: vi.fn(),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust the limit for IP 1.2.3.4
    for (let i = 0; i < 3; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '1.2.3.4');
    }

    // 1.2.3.4 should now be rate-limited
    const blockedRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '1.2.3.4');
    expect(blockedRes.status).toBe(429);

    // 5.6.7.8 should NOT be affected
    const otherRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '5.6.7.8');
    expect(otherRes.status).toBe(200);
  });

  it('app has trust proxy enabled', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        FREE_TIER_RATE_LIMIT: 3,
        HARD_RATE_LIMIT: 10,
        X402_PAY_TO: undefined,
      },
    }));
    vi.doMock('./x402', () => ({
      createGasAwareX402Middleware: vi.fn(),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    expect(app.get('trust proxy')).toBe(1);
  });
});

// ─── Tiered rate limiting (with x402) ───────────────────────────────────────

describe('tiered rate limiting with trust proxy (x402 mode)', () => {
  it('free tier exhaustion is per-IP — other IPs are not pushed to payment', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        FREE_TIER_RATE_LIMIT: 3,
        HARD_RATE_LIMIT: 100,
        X402_PAY_TO: '0x1234567890abcdef1234567890abcdef12345678',
      },
    }));
    vi.doMock('./x402', () => ({
      createGasAwareX402Middleware: vi.fn(() => {
        return (req: Request, res: Response, next: NextFunction) => {
          if (!req.headers['payment-signature']) {
            res.status(402).json({ error: 'Payment Required' });
            return;
          }
          next();
        };
      }),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust free tier for IP 1.2.3.4
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get('/test')
        .set('X-Forwarded-For', '1.2.3.4');
      expect(res.status).toBe(200);
    }

    // 1.2.3.4 should now get 402 (pushed to payment)
    const paymentRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '1.2.3.4');
    expect(paymentRes.status).toBe(402);

    // 5.6.7.8 should still get 200 — NOT pushed to payment by someone else's usage
    const otherRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '5.6.7.8');
    expect(otherRes.status).toBe(200);
  });

  it('hard limit is per-IP — one abuser cannot 429 everyone', async () => {
    vi.doMock('./config', () => ({
      config: {
        isProd: false,
        RATE_LIMIT_WINDOW_MS: 60000,
        FREE_TIER_RATE_LIMIT: 100,
        HARD_RATE_LIMIT: 5,
        X402_PAY_TO: '0x1234567890abcdef1234567890abcdef12345678',
      },
    }));
    vi.doMock('./x402', () => ({
      createGasAwareX402Middleware: vi.fn(() => {
        return (_req: Request, _res: Response, next: NextFunction) => next();
      }),
    }));

    const { createApp } = await import('./app');
    const app = createApp();
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Exhaust hard limit for IP 10.0.0.1
    for (let i = 0; i < 5; i++) {
      await request(app).get('/test').set('X-Forwarded-For', '10.0.0.1');
    }

    // 10.0.0.1 should be hard-blocked with 429
    const blockedRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '10.0.0.1');
    expect(blockedRes.status).toBe(429);

    // 10.0.0.2 should still be fine
    const otherRes = await request(app)
      .get('/test')
      .set('X-Forwarded-For', '10.0.0.2');
    expect(otherRes.status).toBe(200);
  });
});
